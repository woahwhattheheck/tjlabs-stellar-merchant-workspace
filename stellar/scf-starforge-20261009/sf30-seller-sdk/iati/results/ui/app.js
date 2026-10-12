/* MIT. Results review in the original IATI authenticated console. */
'use strict';
window.IatiResultsUi = function IatiResultsUi(api) {
  const {get,post,request,action,status,download,metrics,table,properties,details,workspaceState}=api;
  const prefix='/api/iati/results', storageBase='sf30.iati.results.';
  let inventory=null, projection=null, browse=null, indicator=null, pageOffset=0;
  let pickedSource='', search='', measure='', current=null, currentHead=null, preview=null, compared=null;
  let draft=emptyDraft(), pending=null, lastReceipt=null, activeTab='source', booted=false;
  const periodChoices=new Map();
  const panel=el('section',{className:'irm',hidden:true});panel.dataset.panel='results';
  const title=el('h1',{textContent:'Results monitoring'}),intro=el('p',{className:'lead',
    textContent:'Inspect original indicators, select comparable observations, review a saved edition, and hand over the complete source project.'});
  const tabs=el('div',{className:'irm-tabs'}),body=el('div'),pendingBox=el('div',{className:'irm-pending',hidden:true});
  const page=el('div',{className:'irm-header'});page.append(title,intro);
  panel.append(page,tabs,pendingBox,body);
  document.getElementById('main').append(panel);
  const nav=el('button',{type:'button',textContent:'Results'});nav.dataset.view='results';
  (document.querySelector('nav')||document.getElementById('main')).append(nav);
  nav.onclick=()=>{show();if(!booted)run('Opening saved results work…',refresh);};
  for(const [key,name] of [['source','Source indicators'],['project','Review project'],['compare','Compare revisions'],['transfer','Receive / export']]){
    const b=button(name,()=>{capture();activeTab=key;render();});b.dataset.tab=key;tabs.append(b);
  }

  function el(tag,attrs={}){return Object.assign(document.createElement(tag),attrs);}
  function button(name,fn,attrs={}){const b=el('button',{type:'button',textContent:name,...attrs});b.onclick=fn;return b;}
  function field(label,input){const holder=el('label',{className:'irm-field'});holder.append(el('span',{textContent:label}),input);return holder;}
  function textInput(value,fn,attrs={}){const x=el('input',{type:'text',value:value??'',...attrs});x.oninput=()=>fn(x.value);return x;}
  function textarea(value,fn,rows=3){const x=el('textarea',{value:value??'',rows});x.oninput=()=>fn(x.value);return x;}
  function select(items,value,fn){const x=el('select');for(const [v,label] of items)x.add(new Option(label,v));x.value=value??'';x.onchange=()=>fn(x.value);return x;}
  function row(...nodes){const r=el('div',{className:'irm-row'});r.append(...nodes);return r;}
  function section(name){const s=el('section',{className:'irm-section'});s.append(el('h2',{textContent:name}));return s;}
  function note(text){return el('p',{className:'irm-note',textContent:text});}
  function short(value){return String(value??'').slice(0,12);}
  function identity(value){return el('p',{className:'irm-identity',textContent:value});}
  function query(path,value){return prefix+path+'?'+new URLSearchParams(Object.entries(value).filter(([,v])=>v!==undefined&&v!==null));}
  function show(){
    document.querySelectorAll('[data-panel]').forEach(n=>n.hidden=n!==panel);
    document.querySelectorAll('nav [data-view]').forEach(n=>{n.classList.toggle('active',n===nav);n.setAttribute('aria-current',n===nav?'page':'false');});
  }
  async function run(message,fn){await action(message,async()=>{try{await fn();}finally{buttons();}});}
  function emptyDraft(){return {name:'Results review',notes:'',sources:[],selection:{indicatorKeys:[],activityIds:[],resultTypes:[],measures:[],
    periodFrom:'',periodTo:'',includeUndated:true},review:{status:'draft',reviewer:'',note:''},interpretations:[],bindings:[]};}
  function key(suffix){return inventory?storageBase+inventory.workspaceId+'.'+suffix:null;}
  function persistDraft(){if(!inventory)return;try{sessionStorage.setItem(key('draft'),JSON.stringify({draft,currentId:current?.id??null,currentRevision:current?.revision??null}));}catch{}}
  function capture(){persistDraft();}
  function update(fn){fn();preview=null;persistDraft();}
  function retainPending(value){
    if(!inventory)throw new Error('Open the original results workspace first.');
    if(value)sessionStorage.setItem(key('pending'),JSON.stringify(value));else sessionStorage.removeItem(key('pending'));
    pending=value;buttons();
  }
  function restoreLocal(){
    try{const saved=JSON.parse(sessionStorage.getItem(key('draft'))||'null');
      if(saved?.draft){draft=saved.draft;if(saved.currentId&&saved.currentRevision)current={id:saved.currentId,revision:saved.currentRevision,restoredDraft:true};}}
    catch{draft=emptyDraft();}
    try{pending=JSON.parse(sessionStorage.getItem(key('pending'))||'null');}catch{pending=null;}
  }
  async function refresh(){
    const result=await get(prefix);
    if(result.schema!=='stellar-forge.iati-results-inventory.v1'||!result.workspaceId)throw new Error('This is not the original results workspace.');
    const first=!inventory||inventory.workspaceId!==result.workspaceId;inventory=result;
    if(first){restoreLocal();booted=true;}
    if(!pickedSource)pickedSource=workspaceState().sources[0]?.id??'';
    if(current){const head=inventory.projects.find(p=>p.id===current.id);currentHead=head?.revision??null;}
    render();status(inventory.projects.length+' saved results projects in the original source workspace.');
  }
  async function applyResponse(kind,result){
    if(kind==='save'){current=result;currentHead=result.revision;draft=structuredClone(result.definition);preview=result.report;activeTab='project';}
    else if(kind==='compare'){compared=result;activeTab='compare';}
    else if(kind==='adopt'){await openProject(result.id,result.selectedRevision);activeTab='project';}
    await refresh();persistDraft();render();
  }
  async function mutate(kind,bodyValue){
    if(pending)throw new Error('Resolve the retained original request before submitting another edit.');
    const input={...structuredClone(bodyValue),requestId:crypto.randomUUID()};
    const saved={kind,input,createdAt:new Date().toISOString(),workspaceId:inventory.workspaceId};
    retainPending(saved);
    const result=await post(prefix+'/'+kind,input);
    retainPending(null);
    await applyResponse(kind,result);
    status('Original '+kind+' request completed and retained: '+input.requestId);
  }
  async function recover(retry=false){
    if(!pending)return;
    const saved=pending;
    if(saved.workspaceId!==inventory.workspaceId)throw new Error('Retained request belongs to another original workspace.');
    const observed=await get(query('/operation',{requestId:saved.input.requestId}));
    if(observed.found&&observed.state==='CANCELLED'){retainPending(null);render();status('The exact original request is cancelled before commit. Correct the project draft and save a new request.');return;}
    if(observed.found){
      if(JSON.stringify(observed.input)!==JSON.stringify(saved.input)){
        // Canonical field order can differ; compare recursively rather than choose a new key.
        if(canonical(observed.input)!==canonical(saved.input))throw new Error('Original request selects different retained work.');
      }
      const response=observed.response;retainPending(null);await applyResponse(saved.kind,response);
      status('Recovered the original committed '+saved.kind+' response.');return;
    }
    if(!retry){render();status('The exact request is not committed. Continue the retained request to submit the same input.');return;}
    const response=await post(prefix+'/'+saved.kind,saved.input);
    retainPending(null);await applyResponse(saved.kind,response);status('The original retained request completed.');
  }
  async function cancelPending(){
    if(!pending)return;
    if(!pending.cancellation)retainPending({...pending,cancellation:{requestId:crypto.randomUUID(),targetKind:pending.kind,
      targetInput:structuredClone(pending.input),reason:'Operator chose to correct the retained uncommitted draft input.'}});
    const observed=await get(query('/operation',{requestId:pending.input.requestId}));
    if(observed.found){await recover(false);return;}
    await post(prefix+'/cancel',pending.cancellation);
    retainPending(null);render();status('Exact uncommitted request cancelled in the original journal. The draft remains editable.');
  }
  function canonical(value){return value&&typeof value==='object'?
    Array.isArray(value)?'['+value.map(canonical).join(',')+']':
    '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);}
  function buttons(){
    pendingBox.replaceChildren();pendingBox.hidden=!pending;
    if(pending){pendingBox.append(el('strong',{textContent:'Retained '+pending.kind+' request'}),identity(pending.input.requestId),
      note('A lost response keeps the exact original input. Reading or retrying this request uses its existing identity.'),
      row(button('Read original result',()=>run('Reconciling the original request…',()=>recover(false))),
          button('Continue exact request',()=>run('Continuing the same original request…',()=>recover(true))),
          button('Cancel uncommitted request and edit draft',()=>run('Recording an exact original cancellation…',cancelPending))));
    }
    panel.querySelectorAll('[data-mutation]').forEach(b=>b.disabled=Boolean(pending)||!inventory);
    tabs.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===activeTab);b.setAttribute('aria-selected',String(b.dataset.tab===activeTab));});
  }
  function mutationButton(name,fn){const b=button(name,fn);b.dataset.mutation='true';return b;}
  function render(){
    body.replaceChildren();
    if(!inventory){body.append(note('Open the original saved workspace to begin.'));buttons();return;}
    if(activeTab==='source')renderSource();
    if(activeTab==='project')renderProject();
    if(activeTab==='compare')renderCompare();
    if(activeTab==='transfer')renderTransfer();
    buttons();
  }
  function sourceChoices(){
    const holder=el('div',{className:'irm-source-choices'});
    for(const source of workspaceState().sources){
      const check=el('input',{type:'checkbox',checked:draft.sources.includes(source.id)});
      check.onchange=()=>update(()=>{draft.sources=check.checked?[...new Set([...draft.sources,source.id])]:draft.sources.filter(x=>x!==source.id);});
      const label=el('label');label.append(check,el('span',{textContent:(source.label||source.name)+' · '+short(source.id)}));holder.append(label);
    }
    if(!workspaceState().sources.length)holder.append(note('Use the existing Sources tab to retain a complete original publisher XML.'));
    return holder;
  }
  async function loadBrowse(offset=0){
    if(!projection)throw new Error('Inspect a retained publisher source first.');
    pageOffset=offset;browse=await get(query('/indicators',{projection:projection.id,offset,limit:50,search,measure}));render();
  }
  async function inspectSource(){
    if(!pickedSource)throw new Error('Choose one complete original publisher source.');
    const result=await post(prefix+'/source',{source:pickedSource});projection=result.projection;indicator=null;
    await loadBrowse();status(result.counts.indicators+' original indicators · '+result.counts.valueRecords+' value records.');await refresh();
  }
  function selectIndicator(value){
    update(()=>{draft.sources=[...new Set([...draft.sources,value.source])];
      draft.selection.indicatorKeys=[...new Set([...draft.selection.indicatorKeys,value.key])];});
  }
  async function openIndicator(keyValue){
    indicator=await get(query('/indicator',{projection:projection.id,key:keyValue}));periodChoices.clear();render();
  }
  function renderSource(){
    const s=section('Retained publisher edition');
    s.append(row(field('Original source',select([['','Choose a source'],...workspaceState().sources.map(v=>[v.id,(v.label||v.name)+' · '+short(v.id)])],
      pickedSource,v=>{pickedSource=v;})),button('Inspect results',()=>run('Projecting the original publisher results…',inspectSource))));
    s.append(note('Inspection uses the original retained XML reader. It creates no provider request, financial edition or new source capture.'));
    if(projection)s.append(identity('Projection '+projection.id+'\nOriginal source '+projection.source.id),
      button('Download original XML',()=>run('Opening the exact original XML…',()=>download(query('/source/download',{source:projection.source.id}),'iati-publisher.xml'))));
    body.append(s);
    if(browse){
      const all=section('Original indicator inventory');
      all.append(row(field('Find activity or indicator',textInput(search,v=>{search=v;},{placeholder:'Original title or activity identifier'})),
        field('Measure',select([['','All measures'],['1','Unit'],['2','Percentage'],['3','Nominal'],['4','Ordinal'],['5','Qualitative']],measure,v=>{measure=v;})),
        button('Apply source filter',()=>run('Reading the selected original indicator page…',()=>loadBrowse(0)))));
      const counts=el('div');metrics(counts,Object.entries(browse.sourceCounts).map(([k,v])=>[k,v]));all.append(counts);
      const list=el('div',{className:'irm-indicator-list'});
      for(const value of browse.rows){
        const card=el('article',{className:'irm-card'});
        card.append(el('h3',{textContent:value.title||'Untitled original indicator'}),
          note(value.activityId+' · '+value.resultTitle),
          note(value.measureLabel+' · '+value.periods+' periods · '+value.targets+' targets · '+value.actuals+' actuals'),
          identity(value.key),row(button('Inspect original records',()=>run('Opening the complete original indicator…',()=>openIndicator(value.key))),
          button('Add to explicit project selection',()=>{selectIndicator(value);status(draft.selection.indicatorKeys.length+' exact indicators selected for this project.');})));
        list.append(card);
      }
      if(!browse.rows.length)list.append(note('No original indicator records match. The complete source and its empty-results coverage remain available.'));
      all.append(list,row(button('Previous page',()=>run('Reading original indicators…',()=>loadBrowse(Math.max(0,pageOffset-50))),{disabled:pageOffset===0}),
        el('span',{textContent:(browse.rows.length?pageOffset+1:0)+'–'+(pageOffset+browse.rows.length)+' of '+browse.total}),
        button('Next page',()=>run('Reading original indicators…',()=>loadBrowse(browse.nextOffset)),{disabled:browse.nextOffset===null})));
      body.append(all);
    }
    if(indicator)renderIndicator();
  }
  function meaningFor(keyValue){
    let value=draft.interpretations.find(v=>v.indicatorKey===keyValue);
    if(!value){value={indicatorKey:keyValue,unitLabel:'',direction:'reported',note:''};draft.interpretations.push(value);}
    return value;
  }
  function renderIndicator(){
    const i=indicator,s=section(i.title||'Original indicator'),meaning=draft.interpretations.find(v=>v.indicatorKey===i.key)||{unitLabel:'',direction:'reported',note:''};
    properties(s,{activity:i.activityId,reportingOrganisation:i.reportingOrgRef,result:i.resultTitle,measure:i.measureLabel,
      originalAscending:i.ascending,originalAggregationStatus:i.aggregationStatus,source:i.source,locator:i.locator});
    details(s,'Original descriptions, references and document links',{titles:i.titles,descriptions:i.descriptions,references:i.references,documents:i.documents,attributes:i.attributes});
    s.append(el('h3',{textContent:'Source-bound interpretation'}));
    const change=(keyName,value)=>update(()=>{selectIndicator(i);meaningFor(i.key)[keyName]=value;});
    s.append(row(field('Unit meaning (Unit measure)',textInput(meaning.unitLabel,v=>change('unitLabel',v))),
      field('Improvement direction',select([['reported','Use original ascending value'],['higher','Explicit higher is better'],['lower','Explicit lower is better'],['none','No directional conclusion']],
        meaning.direction,v=>change('direction',v)))));
    s.append(field('Interpretation and source basis',textarea(meaning.note,v=>change('note',v))));
    if(i.baselines.length){const b=el('div');table(b,['key','year','isoDate','rawValue','dimensions','locations','comments'],i.baselines);s.append(el('h3',{textContent:'Original baseline records'}),b);}
    for(const period of i.periods){
      const p=el('section',{className:'irm-period'});p.append(el('h3',{textContent:(period.startOriginal||'Unplaced start')+' → '+(period.endOriginal||'Unplaced end')}));
      const records=el('div');table(records,['kind','key','rawValue','dimensions','locations','comments'],[...period.targets,...period.actuals]);p.append(records);
      const original=draft.bindings.find(v=>v.periodKey===period.key);
      const candidate=period.candidatePairs[0];
      let chosen=periodChoices.get(period.key);
      if(!chosen){chosen=original?structuredClone(original):{periodKey:period.key,targetKey:candidate?.targetKey??'',actualKey:candidate?.actualKey??'',
        baselineKey:null,operation:'inspect',note:''};periodChoices.set(period.key,chosen);}
      const valueLabel=v=>(v.rawValue===null?'Value not supplied':v.rawValue)+' · '+JSON.stringify(v.dimensions)+' · '+short(v.key);
      const targetChoice=select([['',chosen.operation==='baseline-change'?'No target selected':'Choose original target'],...period.targets.map(v=>[v.key,valueLabel(v)])],
        chosen.targetKey??'',v=>{chosen.targetKey=v||null;});targetChoice.disabled=chosen.operation==='baseline-change';
      p.append(row(field('Exact target',targetChoice),
        field('Exact actual',select([['','Choose original actual'],...period.actuals.map(v=>[v.key,valueLabel(v)])],chosen.actualKey,v=>{chosen.actualKey=v;}))));
      p.append(row(field('Optional original baseline',select([['','No baseline'],...i.baselines.map(v=>[v.key,(v.year||'Undated')+' · '+valueLabel(v)])],
        chosen.baselineKey||'',v=>{chosen.baselineKey=v||null;})),
        field('Selected calculation',select([['inspect','Inspect original observations'],['difference','Actual minus target'],['target-ratio','Actual / target × 100'],['baseline-progress','Progress from baseline to target'],['baseline-change','Actual minus baseline (no target)']],
        chosen.operation,v=>{chosen.operation=v;if(v==='baseline-change')chosen.targetKey=null;render();}))));
      p.append(field('Pair selection / formula basis',textarea(chosen.note,v=>{chosen.note=v;},2)),
        button('Retain this pair in the project draft',()=>{
          if(!chosen.actualKey||(!chosen.targetKey&&chosen.operation!=='baseline-change')){status('Choose the exact original actual and, for target comparisons, its original target.',true);return;}
          if(['baseline-change','baseline-progress'].includes(chosen.operation)&&!chosen.baselineKey){status('Choose the exact original baseline for this operation.',true);return;}
          selectIndicator(i);update(()=>{draft.bindings=draft.bindings.filter(v=>!(v.periodKey===chosen.periodKey&&v.targetKey===chosen.targetKey&&v.actualKey===chosen.actualKey));
            draft.bindings.push(structuredClone(chosen));});status('Exact original pair retained. Preview the project to read its calculation or concrete comparability findings.');render();
        }));
      if(period.findings.length)details(p,'Original period findings',period.findings);
      s.append(p);
    }
    if(!i.periods.length)s.append(note('This indicator has no original period records. Baseline, references and narratives remain retained.'));
    body.append(s);
  }
  async function openProject(id,revision){
    current=await get(query('/project',{id,revision}));draft=structuredClone(current.definition);preview=current.report;
    currentHead=inventory.projects.find(v=>v.id===id)?.revision??null;persistDraft();render();
  }
  function newProject(){
    current=null;currentHead=null;draft=emptyDraft();preview=null;compared=null;
    if(pickedSource)draft.sources=[pickedSource];periodChoices.clear();persistDraft();render();
  }
  function projectInput(){const value=structuredClone(draft);if(current){value.id=current.id;value.expectedRevision=current.revision;}return value;}
  function renderProject(){
    const saved=section('Saved project and immutable history');
    let id=current?.id??inventory.projects[0]?.id??'';
    saved.append(row(field('Results project',select([['','Choose a saved project'],...inventory.projects.map(v=>[v.id,v.name+' · r'+v.revision+' · '+v.review.status])],id,v=>{id=v;})),
      button('Open current head',()=>run('Opening the original saved results head…',()=>openProject(id))),
      button('New project',newProject),button('Refresh saved inventory',()=>run('Reading the original results inventory…',refresh))));
    if(current){
      saved.append(identity(current.id+'\nEditing revision '+current.revision+' · current local head '+currentHead),
        button('Read complete history',()=>run('Reading every retained results revision…',async()=>{
          const value=await get(query('/history',{id:current.id}));currentHead=value.headRevision;
          const list=el('div',{className:'irm-row'});
          for(const edition of value.editions)list.append(button('r'+edition.revision+' · '+edition.definition.review.status+' · '+edition.definition.name,
            ()=>run('Opening exact original revision '+edition.revision+'…',()=>openProject(edition.id,edition.revision))));
          saved.append(list);status(value.editions.length+' immutable revisions retained.');})));
      if(current.revision!==currentHead)saved.append(note('You are reading a historical or received edition. Select it as the working head before continuing edits.'),
        mutationButton('Select this exact edition as working head',()=>run('Selecting the original working edition…',async()=>{
          const actor=draft.review.reviewer.trim(),noteText=draft.review.note.trim();
          if(!actor||!noteText)throw new Error('Supply the receiving reviewer and selection basis below.');
          await mutate('adopt',{id:current.id,expectedRevision:currentHead,selectedRevision:current.revision,actor,note:noteText});})));
    }
    body.append(saved);
    const form=section('Project selection and named review');
    form.append(field('Project title',textInput(draft.name,v=>update(()=>{draft.name=v;}))),
      field('Purpose / scope notes',textarea(draft.notes,v=>update(()=>{draft.notes=v;}))),el('h3',{textContent:'Original publisher sources'}),sourceChoices());
    form.append(note(draft.selection.indicatorKeys.length?draft.selection.indicatorKeys.length+' exact source-bound indicators selected.':
      'All indicators matching the selected source and filter fields are included.'),
      button('Use all matching source indicators',()=>update(()=>{draft.selection.indicatorKeys=[];draft.bindings=[];draft.interpretations=[];render();})));
    const filters=row();
    for(const [name,keyName]of [['Activity identifiers','activityIds'],['Result type codes','resultTypes'],['Measure codes','measures']]){
      filters.append(field(name+' (one per line)',textarea(draft.selection[keyName].join('\n'),v=>update(()=>{draft.selection[keyName]=[...new Set(v.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];}),2)));
    }
    form.append(filters,row(field('Period from',textInput(draft.selection.periodFrom,v=>update(()=>{draft.selection.periodFrom=v;}),{type:'date'})),
      field('Period through',textInput(draft.selection.periodTo,v=>update(()=>{draft.selection.periodTo=v;}),{type:'date'}))));
    const undated=el('input',{type:'checkbox',checked:draft.selection.includeUndated});undated.onchange=()=>update(()=>{draft.selection.includeUndated=undated.checked;});
    const u=el('label',{className:'irm-check'});u.append(undated,el('span',{textContent:'Retain unresolved original dates in the selected report'}));form.append(u);
    if(draft.bindings.length){
      const bindings=el('div');table(bindings,['periodKey','targetKey','actualKey','baselineKey','operation','note'],draft.bindings);form.append(el('h3',{textContent:'Explicit original comparisons'}),bindings);
      const choices=el('div',{className:'irm-row'});draft.bindings.forEach((binding,index)=>choices.append(button('Remove pair '+(index+1),()=>{update(()=>{draft.bindings.splice(index,1);});render();})));form.append(choices);
    }
    form.append(row(field('Review status',select([['draft','Draft'],['reviewed','Reviewed'],['needs-correction','Needs correction']],draft.review.status,v=>update(()=>{draft.review.status=v;}))),
      field('Named reviewer',textInput(draft.review.reviewer,v=>update(()=>{draft.review.reviewer=v;})))));
    form.append(field('Review conclusion / source basis',textarea(draft.review.note,v=>update(()=>{draft.review.note=v;}))),
      row(button('Preview complete selected report',()=>run('Reconstructing the complete report from original source records…',async()=>{
        const result=await post(prefix+'/preview',structuredClone(draft));preview=result.report;draft=result.definition;persistDraft();render();status('Complete source-bound preview prepared.');})),
        mutationButton(current?'Save new immutable revision':'Save reviewed project',()=>run('Saving the exact selected results revision…',()=>mutate('save',projectInput())))));
    form.append(note('Named review records your interpretation. Original values, their source findings and any unplaced observations remain in the complete report.'));
    body.append(form);
    if(preview)renderReport(preview);
  }
  function renderReport(value){
    const s=section('Complete selected report'),m=el('div');metrics(m,Object.entries(value.counts).map(([k,v])=>[k,v]));s.append(m,identity(value.reportSha256));
    const comparisons=el('div');table(comparisons,['indicator','period','operation','status','actualMinusTarget','differenceMeaning','ratioPercent','ratioFormula','reasons'],
      value.comparisons.map(v=>({indicator:v.indicatorKey,period:v.periodKey,operation:v.binding.operation,status:v.status,
        actualMinusTarget:v.calculation?.actualMinusTarget,actualMinusBaseline:v.calculation?.actualMinusBaseline,differenceMeaning:v.calculation?.differenceMeaning,
        directionalBaselineRelation:v.calculation?.directionalBaselineRelation,
        ratioPercent:v.calculation?.ratioPercent,ratioFormula:v.calculation?.ratioFormula,reasons:v.reasons})));s.append(comparisons);
    const coverage=el('div');table(coverage,['source','projectionSha256','sourceCounts'],value.coverage);s.append(el('h3',{textContent:'Exact publisher coverage'}),coverage);
    details(s,'Original activity, result and location context',{activities:value.activities,results:value.results});
    const findings=el('div');table(findings,['source','locator','code','message'],value.findings);s.append(el('h3',{textContent:'Source and comparability findings'}),findings);
    details(s,'Complete original report JSON',value);body.append(s);
  }
  function renderCompare(){
    const s=section('Following-source and revision comparison');
    let id=current?.id??inventory.projects[0]?.id??'',before='1',after=current?String(current.revision):'2',pairs='[]';
    s.append(field('Saved project',select([['','Choose a project'],...inventory.projects.map(v=>[v.id,v.name])],id,v=>{id=v;})),
      row(field('Earlier revision',textInput(before,v=>{before=v;},{type:'number',min:'1'})),field('Following revision',textInput(after,v=>{after=v;},{type:'number',min:'1'}))),
      note('The same original source key pairs automatically. A replacement publisher XML has new source-bound indicator keys; supply each explicit before/after key and mapping note. Titles alone never join two source records.'),
      field('Explicit replacement pairs (JSON array)',textarea(pairs,v=>{pairs=v;},7)),
      note('Each entry: {"before":"FULL_INDICATOR_KEY","after":"FULL_INDICATOR_KEY","note":"Original source relationship and reviewed mapping basis"}'),
      mutationButton('Retain complete revision comparison',()=>run('Comparing the original source and interpretation revisions…',
        ()=>mutate('compare',{id,beforeRevision:Number(before),afterRevision:Number(after),pairs:JSON.parse(pairs)}))),
      button('Read existing comparisons',()=>run('Reading saved original comparisons…',async()=>{
        const value=await get(query('/comparisons',{id}));const holder=el('div');
        for(const item of value.comparisons)holder.append(button('r'+item.beforeRevision+' → r'+item.afterRevision+' · '+short(item.id),()=>{compared=item;render();}));
        s.append(holder);status(value.comparisons.length+' original comparisons retained.');})));
    body.append(s);
    if(compared){
      const c=section('Retained source / selection changes');properties(c,{id:compared.id,project:compared.project,beforeRevision:compared.beforeRevision,afterRevision:compared.afterRevision,
        beforeEdition:compared.beforeEditionSha256,afterEdition:compared.afterEditionSha256,
        selectionChanged:compared.comparison.selectionChanged,interpretationChanged:compared.comparison.interpretationChanged});
      const grid=el('div');table(grid,['before','after','note','changedFields','originalValuesChanged','selectedValuesChanged','activityIdentityChanged'],compared.comparison.pairs);c.append(grid);
      properties(c,{removedIndicators:compared.comparison.removedIndicators,addedIndicators:compared.comparison.addedIndicators});
      details(c,'Complete original comparison',compared);body.append(c);
    }
  }
  function renderTransfer(){
    const s=section('Readable report and editable project handover');
    let id=current?.id??inventory.projects[0]?.id??'',revision=current?String(current.revision):'';
    s.append(row(field('Saved project',select([['','Choose a project'],...inventory.projects.map(v=>[v.id,v.name+' · r'+v.revision])],id,v=>{id=v;})),
      field('Exact revision (blank = current head)',textInput(revision,v=>{revision=v;},{type:'number',min:'1'}))));
    const params=()=>{if(!id)throw new Error('Choose the original saved project.');return{id,revision:revision||undefined};};
    s.append(row(button('Download complete report / CSVs',()=>run('Building the exact selected readable report…',()=>download(query('/report/export',params()),'iati-results-report.zip'))),
      button('Download full editable source project',()=>run('Preparing complete original source/history receiving…',()=>download(query('/export',params()),'iati-results-project.zip')))));
    s.append(note('The editable project carries all original publisher XML, every saved revision, explicit comparisons and prior receiving snapshots. Receiving reconstructs reports from those bytes. Existing local heads stay selected; imported requests remain provenance and are not executed.'));
    body.append(s);
    const r=section('Receive a complete results project'),file=el('input',{type:'file',accept:'.zip,application/zip'});
    const expected=textInput('',()=>{}, {placeholder:'Optional expected SHA256'});
    r.append(field('Original receiving archive',file),field('Expected archive SHA256',expected),
      button('Verify and receive original project',()=>run('Verifying all original bytes and reconstructing the complete report…',async()=>{
        const selected=file.files[0];if(!selected)throw new Error('Choose the complete original results archive.');
        const headers={'content-type':'application/zip','X-IATI-Results-Bytes':String(selected.size)};
        if(expected.value.trim())headers['X-IATI-Results-Sha256']=expected.value.trim();
        const response=await request(prefix+'/receive',{method:'POST',headers,body:selected});lastReceipt=await response.json();
        await refresh();status('Original source project received; selected and existing local head identities are retained.');
      })));
    if(lastReceipt)properties(r,lastReceipt);
    body.append(r);
    const receipts=section('Retained receiving history'),grid=el('div');table(grid,['id','project','receivedAt','selectedRevision','localHeadBefore','localHeadAfter','preservedExistingHead'],inventory.receipts);receipts.append(grid);body.append(receipts);
  }
  return {buttons,refresh,show};
};
