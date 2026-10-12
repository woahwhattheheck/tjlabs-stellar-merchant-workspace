/* MIT. Results review in the original IATI authenticated console. */
'use strict';
window.IatiResultsUi = function IatiResultsUi(api) {
  const {get,post,request,action,status,download,metrics,table,properties,details,workspaceState}=api;
  const prefix='/api/iati/results', storageBase='sf30.iati.results.';
  let inventory=null, projection=null, browse=null, indicator=null, pageOffset=0;
  let pickedSource='', search='', measure='', current=null, currentHead=null, preview=null, compared=null;
  let draft=emptyDraft(), pending=null, lastReceipt=null, activeTab='programme', booted=false;
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
  for(const [key,name] of [['programme','Programme desk'],['source','Source indicators'],['project','Review project'],['compare','Following edition'],['transfer','Receive / export']]){
    const b=button(name,()=>{capture();activeTab=key;render();});b.dataset.tab=key;tabs.append(b);
  }

  function el(tag,attrs={}){
    const node=Object.assign(document.createElement(tag),attrs);
    if(['button','input','select','textarea'].includes(tag))node.dataset.baseDisabled=node.disabled?'1':'0';
    return node;
  }
  function disabled(node,value){node.dataset.baseDisabled=value?'1':'0';node.disabled=Boolean(value);return node;}
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
  let journalDatabase=null, draftWrite=Promise.resolve(true), draftStorageError=null, queuedDraftSignature=null;
  let tabIdentity;
  try {tabIdentity=sessionStorage.getItem(storageBase+'tab');if(!tabIdentity){tabIdentity=crypto.randomUUID();sessionStorage.setItem(storageBase+'tab',tabIdentity);}}
  catch {tabIdentity=crypto.randomUUID();}
  function journalKey(suffix){return inventory.workspaceId+':'+suffix;}
  async function openJournal(){
    if(journalDatabase)return journalDatabase;
    journalDatabase=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('sf30-iati-results-operator',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});
      request.onsuccess=()=>{const database=request.result;database.onversionchange=()=>{database.close();journalDatabase=null;};resolve(database);};
      request.onerror=()=>reject(request.error||new Error('The browser could not open its saved Results work.'));
      request.onblocked=()=>reject(new Error('Close an older Results tab so the saved browser workspace can open.'));
    });
    return journalDatabase;
  }
  async function readLocal(){
    const database=await openJournal();
    return await new Promise((resolve,reject)=>{
      const tx=database.transaction('records','readonly'),records=tx.objectStore('records'),out={};
      for(const [label,suffix]of [['draft','draft:'+tabIdentity],['lastDraft','last-draft'],['pending','pending']]){
        const request=records.get(journalKey(suffix));request.onsuccess=()=>{out[label]=request.result?.value??null;};
      }
      tx.oncomplete=()=>resolve(out);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Saved Results work could not be read.'));
    });
  }
  async function writeDraft(snapshot,workspace){
    const database=await openJournal();
    return await new Promise((resolve,reject)=>{
      const tx=database.transaction('records','readwrite'),records=tx.objectStore('records'),at=new Date().toISOString();
      for(const suffix of ['draft:'+tabIdentity,'last-draft'])records.put({key:workspace+':'+suffix,value:snapshot,at,tabIdentity});
      tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||new Error('The complete Results draft could not be saved in this browser.'));
    });
  }
  function draftSnapshot(){
    return {draft:structuredClone(draft),currentId:current?.id??null,currentRevision:current?.revision??null,
      activeTab,programme:pmSnapshot()};
  }
  function persistDraft(){
    if(!inventory)return Promise.resolve(false);
    const snapshot=draftSnapshot(),workspace=inventory.workspaceId,signature=workspace+':'+canonical(snapshot);
    if(signature===queuedDraftSignature)return draftWrite;
    queuedDraftSignature=signature;
    draftWrite=draftWrite.then(()=>writeDraft(snapshot,workspace)).then(()=>{draftStorageError=null;return true;}).catch(error=>{
      if(queuedDraftSignature===signature)queuedDraftSignature=null;
      draftStorageError=error;status(error.message,true);return false;
    });
    return draftWrite;
  }
  async function writePending(value,expectedId){
    const database=await openJournal();
    return await new Promise((resolve,reject)=>{
      const tx=database.transaction('records','readwrite'),records=tx.objectStore('records'),selected=journalKey('pending');
      let failure;
      const read=records.get(selected);
      read.onsuccess=()=>{
        const existing=read.result?.value;
        if(existing&&existing.input?.requestId!==expectedId){
          failure=new Error('Another Results tab has an original request to reconcile. Open its saved result before sending this draft.');tx.abort();return;
        }
        if(existing&&value&&canonical(existing.input)!==canonical(value.input)){
          failure=new Error('The retained Results request selects another complete input.');tx.abort();return;
        }
        if(value)records.put({key:selected,value:structuredClone(value),at:new Date().toISOString(),tabIdentity});
        else records.delete(selected);
      };
      tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('The exact Results request could not be retained.'));
    });
  }
  function capture(){persistDraft();}
  function update(fn){
    if(pending){status('Reconcile the saved request before changing this draft.',true);return false;}
    fn();preview=null;persistDraft();
    const reportState=panel.querySelector('[data-pm="report-state"]');
    if(reportState)reportState.textContent='The draft has changed. Build the programme report to update its reviewed calculations and outputs.';
    return true;
  }
  async function retainPending(value){
    if(!inventory)throw new Error('Open the original results workspace first.');
    await draftWrite;
    if(draftStorageError)throw draftStorageError;
    try {await writePending(value,pending?.input?.requestId??null);}
    catch(error){try{pending=(await readLocal()).pending;}catch{}buttons();throw error;}
    pending=value;buttons();
  }
  async function restoreLocal(){
    const saved=await readLocal();
    let local=saved.draft??saved.lastDraft,legacyPending=null;
    try {
      if(!local)local=JSON.parse(sessionStorage.getItem(key('draft'))||'null');
      legacyPending=JSON.parse(sessionStorage.getItem(key('pending'))||'null');
    }catch{status('An older tab draft is unreadable; the saved browser workspace is retained.',true);}
    if(local?.draft){draft=structuredClone(local.draft);if(local.currentId&&local.currentRevision)current={id:local.currentId,revision:local.currentRevision,restoredDraft:true};}
    pending=saved.pending;
    if(!pending&&legacyPending){await writePending(legacyPending,null);pending=legacyPending;}
    if(pending&&legacyPending&&pending.input?.requestId===legacyPending.input?.requestId){try{sessionStorage.removeItem(key('pending'));}catch{}}
    if(pending&&pending.workspaceId!==inventory.workspaceId)throw new Error('The saved Results request belongs to another workspace.');
    if(local?.draft){
      if(['programme','source','project','compare','transfer'].includes(local.activeTab))activeTab=local.activeTab;
      await pmRestore(local.programme);await persistDraft();
    }
  }
  async function refresh(){
    const result=await get(prefix);
    if(result.schema!=='stellar-forge.iati-results-inventory.v1'||!result.workspaceId)throw new Error('This is not the original results workspace.');
    const first=!inventory||inventory.workspaceId!==result.workspaceId;inventory=result;
    if(first||!booted){await restoreLocal();booted=true;}
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
    await persistDraft();
    await retainPending(saved);
    const result=await post(prefix+'/'+kind,input);
    await applyResponse(kind,result);
    await persistDraft();
    await retainPending(null);
    status('Original '+kind+' request completed and retained: '+input.requestId);
  }
  async function recover(retry=false){
    if(!pending)return;
    const saved=pending;
    if(saved.workspaceId!==inventory.workspaceId)throw new Error('Retained request belongs to another original workspace.');
    const observed=await get(query('/operation',{requestId:saved.input.requestId}));
    if(observed.found&&observed.state==='CANCELLED'){await retainPending(null);render();status('The exact original request is cancelled before commit. Correct the project draft and save a new request.');return;}
    if(observed.found){
      if(JSON.stringify(observed.input)!==JSON.stringify(saved.input)){
        // Canonical field order can differ; compare recursively rather than choose a new key.
        if(canonical(observed.input)!==canonical(saved.input))throw new Error('Original request selects different retained work.');
      }
      const response=observed.response;await applyResponse(saved.kind,response);await persistDraft();await retainPending(null);
      status('Recovered the original committed '+saved.kind+' response.');return;
    }
    if(!retry){render();status('The exact request is not committed. Continue the retained request to submit the same input.');return;}
    const response=await post(prefix+'/'+saved.kind,saved.input);
    await applyResponse(saved.kind,response);await persistDraft();await retainPending(null);status('The original retained request completed.');
  }
  async function cancelPending(){
    if(!pending)return;
    if(!pending.cancellation)await retainPending({...pending,cancellation:{requestId:crypto.randomUUID(),targetKind:pending.kind,
      targetInput:structuredClone(pending.input),reason:'Operator chose to correct the retained uncommitted draft input.'}});
    const observed=await get(query('/operation',{requestId:pending.input.requestId}));
    if(observed.found){await recover(false);return;}
    await post(prefix+'/cancel',pending.cancellation);
    await retainPending(null);render();status('Exact uncommitted request cancelled in the original journal. The draft remains editable.');
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
    const operating=document.getElementById('main').getAttribute('aria-busy')==='true';
    for(const node of panel.querySelectorAll('button,input,select,textarea')){
      if(node.dataset.baseDisabled===undefined)node.dataset.baseDisabled=node.disabled?'1':'0';
      const edit=node.matches('input,select,textarea')||node.dataset.mutation!==undefined;
      node.disabled=node.dataset.baseDisabled==='1'||operating||Boolean(edit&&pending)||Boolean(node.dataset.mutation!==undefined&&!inventory);
    }
    tabs.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===activeTab);b.setAttribute('aria-selected',String(b.dataset.tab===activeTab));});
  }
  function mutationButton(name,fn){const b=button(name,fn);b.dataset.mutation='true';return b;}
  function render(){
    body.replaceChildren();
    if(!inventory){body.append(note('Open the original saved workspace to begin.'));buttons();return;}
    if(activeTab==='programme')renderProgramme();
    if(activeTab==='source')renderSource();
    if(activeTab==='project')renderProject();
    if(activeTab==='compare')pmRenderCompare();
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
        chosen.targetKey??'',v=>{chosen.targetKey=v||null;});disabled(targetChoice,chosen.operation==='baseline-change');
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

  const programme={
    report:null,definition:null,tab:'framework',search:'',activity:'',kind:'all',dimension:'',
    indicatorKey:'',periodKey:'',sourceChoices:null,rowsOffset:0,
    draftPair:null,editingBinding:null,restoreError:'',compare:{id:'',before:'1',after:'2',history:null,beforeReport:null,afterReport:null,
      beforeKey:'',afterKey:'',note:'',pairs:[],identity:null,editions:null,restoreError:''}
  };
  function pmSnapshot(){
    const c=programme.compare;
    return {tab:programme.tab,search:programme.search,activity:programme.activity,kind:programme.kind,
      dimension:programme.dimension,indicatorKey:programme.indicatorKey,periodKey:programme.periodKey,
      rowsOffset:programme.rowsOffset,sourceChoices:programme.sourceChoices===null?null:[...programme.sourceChoices],
      draftPair:structuredClone(programme.draftPair),editingBinding:structuredClone(programme.editingBinding),
      compare:{id:c.id,before:c.before,after:c.after,beforeKey:c.beforeKey,afterKey:c.afterKey,note:c.note,
        pairs:structuredClone(c.pairs),identity:c.identity,editions:structuredClone(c.editions)}};
  }
  async function pmRestore(saved){
    if(!saved||typeof saved!=='object')return;
    for(const name of ['tab','search','activity','kind','dimension','indicatorKey','periodKey'])
      if(typeof saved[name]==='string')programme[name]=saved[name];
    if(!['framework','observations','worksheet','report'].includes(programme.tab))programme.tab='framework';
    if(Number.isSafeInteger(saved.rowsOffset)&&saved.rowsOffset>=0)programme.rowsOffset=saved.rowsOffset;
    programme.sourceChoices=Array.isArray(saved.sourceChoices)?new Set(saved.sourceChoices.filter(x=>typeof x==='string')):null;
    programme.draftPair=saved.draftPair?structuredClone(saved.draftPair):null;
    programme.editingBinding=saved.editingBinding?structuredClone(saved.editingBinding):null;
    programme.report=null;programme.definition=null;programme.restoreError='';
    const c=programme.compare,old=saved.compare;
    if(old&&typeof old==='object'){
      for(const name of ['id','before','after','beforeKey','afterKey','note'])if(typeof old[name]==='string')c[name]=old[name];
      c.pairs=Array.isArray(old.pairs)?structuredClone(old.pairs):[];
      c.editions=Array.isArray(old.editions)?structuredClone(old.editions):null;
      c.identity=typeof old.identity==='string'?old.identity:null;
      c.beforeReport=null;c.afterReport=null;c.restoreError='';
      if(c.editions){
        try{await pmLoadComparison({restoring:true});}
        catch(error){c.restoreError=error.message;}
      }else if(c.pairs.length){
        c.restoreError='The source correspondence is retained. Open both selected reports to bind it to their exact saved editions.';
      }
    }
    if(draft.sources.length){
      try{const result=await post(prefix+'/preview',structuredClone(draft));preview=result.report;pmRemember(preview);}
      catch(error){programme.restoreError='The saved draft is open. Build its programme report after resolving: '+error.message;}
    }
  }
  function pmResetView(){
    programme.search='';programme.activity='';programme.kind='all';programme.dimension='';programme.rowsOffset=0;
    programme.indicatorKey='';programme.periodKey='';programme.draftPair=null;programme.editingBinding=null;
    programme.sourceChoices=null;programme.restoreError='';
  }
  function pmBindingIdentity(binding){return {periodKey:binding.periodKey,targetKey:binding.targetKey,actualKey:binding.actualKey};}
  function pmSameBinding(a,b){return a.periodKey===b.periodKey&&a.targetKey===b.targetKey&&a.actualKey===b.actualKey;}
  function pmMark(node,name){node.dataset.pm=name;return node;}
  function pmButton(name,fn,tag,mutating=false){
    const node=mutating?mutationButton(name,fn):button(name,fn);
    if(tag)node.dataset.pm=tag;
    return node;
  }
  function pmValue(value){return value===null||value===undefined?'Not supplied':String(value);}
  function pmTitle(value){return value.title||value.resultTitle||value.activityId||'Untitled source record';}
  function pmPeriod(period){return (period.startOriginal||'Start not supplied')+' – '+(period.endOriginal||'End not supplied');}
  function pmDimensions(value){
    const dimensions=(value.dimensions||[]).map(d=>Object.entries(d).map(([k,v])=>k+'='+v).join(' · '));
    const locations=(value.locations||[]).map(d=>'location '+Object.entries(d).map(([k,v])=>k+'='+v).join(' · '));
    return [...dimensions,...locations].join('; ')||'No reported dimensions or locations';
  }
  function pmSelection(value){
    const out=structuredClone(value||{});
    for(const name of ['indicatorKeys','activityIds','resultTypes','measures'])out[name]=[...(out[name]||[])].sort();
    out.periodFrom=out.periodFrom||'';out.periodTo=out.periodTo||'';out.includeUndated=out.includeUndated!==false;
    return canonical(out);
  }
  function pmRemember(report){
    programme.report=report;programme.definition=canonical(draft);programme.restoreError='';
    if(programme.activity&&!report.indicators.some(x=>x.activityId===programme.activity)){
      programme.activity='';programme.rowsOffset=0;
    }
    if(programme.indicatorKey&&!report.indicators.some(x=>x.key===programme.indicatorKey)){
      programme.indicatorKey='';programme.periodKey='';programme.draftPair=null;programme.editingBinding=null;
    }
  }
  function pmReport(){
    if(preview&&programme.report!==preview)pmRemember(preview);
    const result=programme.report;
    if(!result)return null;
    const sources=result.coverage.map(x=>x.source.id).sort();
    return canonical(sources)===canonical([...draft.sources].sort())&&pmSelection(result.selection)===pmSelection(draft.selection)?result:null;
  }
  async function pmBuild(){
    if(!draft.sources.length)throw new Error('Choose the retained publisher sources for this programme.');
    const selected=structuredClone(draft),signature=canonical(selected);
    const result=await post(prefix+'/preview',selected);
    if(canonical(draft)!==signature)throw new Error('The programme draft changed while its report was being prepared. Build the selected draft again.');
    draft=result.definition;preview=result.report;pmRemember(preview);await persistDraft();
    status('Programme report prepared: '+preview.counts.indicators+' indicators, '+preview.counts.actuals+' actuals and '+preview.counts.targets+' targets.');
    render();
  }
  function pmMatches(indicator){
    const searchValue=programme.search.trim().toLocaleLowerCase();
    if(programme.activity&&indicator.activityId!==programme.activity)return false;
    return !searchValue||[indicator.activityId,indicator.resultTitle,indicator.title,indicator.measureLabel,
      ...(indicator.descriptions||[]).map(x=>x.text||'')].join(' ').toLocaleLowerCase().includes(searchValue);
  }
  function pmTable(holder,columns,rows,{offset=0,pageSize=40,onPage=null,empty='No records in this view.'}={}){
    const component=el('div',{className:'pm-table-component'});holder.append(component);
    function page(selectedOffset){
      component.replaceChildren();
      const actualOffset=rows.length?Math.max(0,Math.min(selectedOffset,Math.floor((rows.length-1)/pageSize)*pageSize)):0;
      const scroll=el('div',{className:'pm-table-scroll'}),grid=el('table',{className:'pm-table'});
      const head=el('thead'),heading=el('tr'),bodyRows=el('tbody');
      for(const column of columns)heading.append(el('th',{scope:'col',textContent:column.label}));
      head.append(heading);grid.append(head,bodyRows);
      for(const item of rows.slice(actualOffset,actualOffset+pageSize)){
        const line=el('tr');if(item._key)line.dataset.recordKey=item._key;
        for(const column of columns){
          const cell=el('td');if(column.className)cell.className=column.className;
          const value=column.render?column.render(item):item[column.key];
          if(value instanceof Node)cell.append(value);else cell.textContent=pmValue(value);
          line.append(cell);
        }
        bodyRows.append(line);
      }
      if(!rows.length){const line=el('tr'),cell=el('td',{colSpan:columns.length,textContent:empty});line.append(cell);bodyRows.append(line);}
      scroll.append(grid);component.append(scroll);
      if(rows.length>pageSize){
        const turn=next=>{if(onPage)onPage(next);else {page(next);buttons();}};
        component.append(row(button('Previous rows',()=>turn(Math.max(0,actualOffset-pageSize)),{disabled:actualOffset===0}),
          note((actualOffset+1)+'–'+Math.min(actualOffset+pageSize,rows.length)+' of '+rows.length+' rows'),
          button('Next rows',()=>turn(actualOffset+pageSize),{disabled:actualOffset+pageSize>=rows.length})));
      }else component.append(note(rows.length+' rows'));
    }
    page(offset);
  }
  function pmOpenIndicator(keyValue,periodKey=''){
    programme.indicatorKey=keyValue;programme.periodKey=periodKey;programme.draftPair=null;programme.editingBinding=null;
    programme.tab='worksheet';render();
    const heading=panel.querySelector('[data-pm="editor-title"]');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'nearest'});}
  }
  function pmSourceForm(holder){
    const sourceRows=workspaceState().sources.filter(x=>x.inventory?.kind!=='organisation');
    const selected=programme.sourceChoices??new Set(draft.sources),list=el('div',{className:'irm-source-choices'});
    for(const source of sourceRows){
      const input=el('input',{type:'checkbox',checked:selected.has(source.id)});input.value=source.id;input.dataset.pm='programme-source';
      input.onchange=()=>{if(programme.sourceChoices===null)programme.sourceChoices=new Set(draft.sources);
        if(input.checked)programme.sourceChoices.add(source.id);else programme.sourceChoices.delete(source.id);};
      const label=el('label'),copy=el('span');copy.append(el('strong',{textContent:source.label||source.name}),
        el('small',{textContent:source.name+' · '+source.bytes+' bytes · '+short(source.id)}));
      label.append(input,copy);list.append(label);
    }
    holder.append(list);
    if(!sourceRows.length)holder.append(note('Retain the original XML in Publisher sources to begin.'));
    holder.append(row(pmButton('Use selected sources',()=>{
      const choice=[...(programme.sourceChoices??new Set(draft.sources))];
      if(!choice.length){status('Select at least one retained publisher source.',true);return;}
      if(canonical([...draft.sources].sort())!==canonical([...choice].sort())){
        update(()=>{draft.sources=choice;draft.selection={indicatorKeys:[],activityIds:[],resultTypes:[],measures:[],periodFrom:'',periodTo:'',includeUndated:true};
          draft.interpretations=[];draft.bindings=[];draft.review={status:'draft',reviewer:draft.review.reviewer,note:''};});
        programme.report=null;programme.definition=null;pmResetView();
        status('Selected sources staged. Previous saved editions remain in the project history.');
      }
      programme.sourceChoices=null;render();
    },'apply-sources',true),
    pmButton('Build programme report',()=>run('Preparing the complete programme report…',pmBuild),'build-programme')));
    holder.append(note('Selecting a different source set starts a fresh source-bound draft selection, interpretation and comparison set.'));
  }
  function pmSavedProjects(holder){
    const grid=el('div',{className:'pm-projects'});
    for(const item of inventory.projects){
      const card=el('article',{className:'pm-project'});
      card.append(el('strong',{textContent:item.name}),note('Revision '+item.revision+' · '+item.review.status),
        pmButton('Open programme',()=>run('Opening the saved programme edition…',async()=>{
          await openProject(item.id);activeTab='programme';programme.sourceChoices=null;programme.tab='framework';render();
        }),'open-programme'));
      card.dataset.projectId=item.id;grid.append(card);
    }
    if(!inventory.projects.length)grid.append(note('Create the first programme report from its retained XML.'));
    holder.append(grid);
  }
  function renderProgramme(){
    const report=pmReport(),header=section('Programme reporting');
    header.dataset.pm='programme';
    header.append(row(field('Programme / report name',pmMark(textInput(draft.name,v=>update(()=>{draft.name=v;}),{maxLength:160}),'programme-name')),
      pmButton('New programme',()=>{newProject();activeTab='programme';programme.tab='framework';render();},'new-programme',true)));
    header.append(field('Programme purpose and reporting scope',pmMark(textarea(draft.notes,v=>update(()=>{draft.notes=v;}),2),'programme-purpose')));
    if(current)header.append(note('Saved revision '+current.revision+' · working head '+currentHead+' · '+draft.review.status),identity(current.id));
    const sources=el('details',{open:!report}),summary=el('summary',{textContent:'Selected publisher sources and saved programmes'});
    sources.append(summary);pmSourceForm(sources);pmSavedProjects(sources);header.append(sources);
    if(programme.restoreError)header.append(pmMark(note(programme.restoreError),'programme-restore-error'));
    body.append(header);
    if(!report){body.append(note('Build the selected programme report to open its complete framework, observations and review worksheet.'));return;}
    const counts=el('div',{className:'pm-counts'});
    for(const [key,label]of [['activities','Activities'],['results','Results'],['indicators','Indicators'],['selectedPeriods','Periods'],['baselines','Baselines'],['targets','Targets'],['actuals','Actuals']]){
      const box=el('div');box.append(el('strong',{textContent:String(report.counts[key])}),el('span',{textContent:label}));counts.append(box);
    }
    body.append(counts);
    const currentReport=programme.definition===canonical(draft);
    body.append(pmMark(note(currentReport?'This report reflects the complete current draft.':'The draft has changed. Build the programme report to update its reviewed calculations and outputs.'),'report-state'));
    const tabs=el('div',{className:'pm-subtabs',role:'tablist'});tabs.setAttribute('aria-label','Programme work');
    for(const [key,label]of [['framework','Framework'],['observations','Observations'],['worksheet','Review worksheet'],['report','Report and handover']]){
      const chosen=programme.tab===key,node=pmButton(label,()=>{programme.tab=key;programme.rowsOffset=0;render();},'programme-tab-'+key);
      node.setAttribute('role','tab');node.setAttribute('aria-selected',String(chosen));node.classList.toggle('active',chosen);tabs.append(node);
    }
    body.append(tabs);
    const area=el('div',{className:'pm-area',role:'tabpanel'});body.append(area);
    if(programme.tab==='framework')pmFramework(area,report);
    else if(programme.tab==='observations')pmObservations(area,report);
    else if(programme.tab==='worksheet')pmWorksheet(area,report);
    else pmProgrammeReport(area,report,currentReport);
  }
  function pmFilters(holder,report,observations=false){
    const activities=[...new Set(report.indicators.map(x=>x.activityId))].sort();
    const controls=row(field('Activity',select([['','All selected activities'],...activities.map(x=>[x,x])],programme.activity,v=>{programme.activity=v;programme.rowsOffset=0;render();})),
      field('Find a result or indicator',textInput(programme.search,v=>{programme.search=v;},{placeholder:'Activity, result or indicator'})),
      pmButton('Apply view filter',()=>{programme.rowsOffset=0;render();},'filter-programme'));
    if(observations)controls.append(field('Observation kind',select([['all','All kinds'],['baseline','Baselines'],['target','Targets'],['actual','Actuals']],programme.kind,v=>{programme.kind=v;programme.rowsOffset=0;render();})));
    holder.append(controls);
  }
  function pmFramework(holder,report){
    const box=section('Complete programme framework');pmFilters(box,report);
    const rows=report.indicators.filter(pmMatches).map(i=>({_key:i.key,indicator:i}));
    pmTable(box,[
      {label:'Activity / result',render:r=>{const x=el('div');x.append(el('strong',{textContent:r.indicator.activityId}),note(r.indicator.resultTitle));return x;}},
      {label:'Indicator',render:r=>pmButton(pmTitle(r.indicator),()=>pmOpenIndicator(r.indicator.key),'inspect-programme-indicator')},
      {label:'Measure and meaning',render:r=>{const i=r.indicator,m=draft.interpretations.find(x=>x.indicatorKey===i.key);return i.measureLabel+(m?.unitLabel?' · '+m.unitLabel:'');}},
      {label:'Baselines',render:r=>r.indicator.baselines.length,className:'number'},
      {label:'Periods',render:r=>r.indicator.periods.length,className:'number'},
      {label:'Targets / actuals',render:r=>r.indicator.periods.reduce((n,p)=>n+p.targets.length,0)+' / '+r.indicator.periods.reduce((n,p)=>n+p.actuals.length,0)},
      {label:'Review comparisons',render:r=>draft.bindings.filter(x=>r.indicator.periods.some(p=>p.key===x.periodKey)).length,className:'number'}
    ],rows,{offset:programme.rowsOffset,onPage:offset=>{programme.rowsOffset=offset;render();}});
    const emptyResults=report.results.filter(r=>!r.selectedIndicatorKeys?.length);
    if(emptyResults.length)details(box,'Results without selected indicators',emptyResults);
    details(box,'Reported activity context',report.activities);holder.append(box);
  }
  function pmObservationRows(report){
    const rows=[];
    for(const indicator of report.indicators.filter(pmMatches)){
      for(const value of indicator.baselines)rows.push({_key:value.key,indicator,period:null,value});
      for(const period of indicator.periods)for(const value of [...period.targets,...period.actuals])rows.push({_key:value.key,indicator,period,value});
    }
    return rows.filter(row=>programme.kind==='all'||row.value.kind===programme.kind);
  }
  function pmObservations(holder,report){
    const box=section('Original observations');pmFilters(box,report,true);
    let rows=pmObservationRows(report);
    const dimensions=[...new Set(rows.map(r=>pmDimensions(r.value)))].sort();
    if(programme.dimension&&!dimensions.includes(programme.dimension))programme.dimension='';
    box.append(field('Reported population / dimensions',select([['','All reported populations'],...dimensions.map(x=>[x,x])],programme.dimension,v=>{programme.dimension=v;programme.rowsOffset=0;render();})));
    if(programme.dimension)rows=rows.filter(r=>pmDimensions(r.value)===programme.dimension);
    pmTable(box,[
      {label:'Indicator',render:r=>pmButton(pmTitle(r.indicator),()=>pmOpenIndicator(r.indicator.key,r.period?.key||''),'review-observation')},
      {label:'Period / baseline year',render:r=>r.period?pmPeriod(r.period):'Baseline '+pmValue(r.value.year)},
      {label:'Kind',render:r=>r.value.kind},
      {label:'Reported value',render:r=>pmValue(r.value.rawValue),className:'number'},
      {label:'Measure',render:r=>r.indicator.measureLabel},
      {label:'Population and location',render:r=>pmDimensions(r.value)},
      {label:'Source context',render:r=>{const d=el('details'),s=el('summary',{textContent:'Read record'}),pre=el('pre',{textContent:JSON.stringify({source:r.value.source,locator:r.value.locator,comments:r.value.comments,documents:r.value.documents,attributes:r.value.attributes,original:r.value.original},null,2)});d.append(s,pre);return d;}}
    ],rows,{offset:programme.rowsOffset,onPage:offset=>{programme.rowsOffset=offset;render();}});
    holder.append(box);
  }
  function pmRecordOptions(records,baseline=false){
    return records.map(v=>[v.key,(baseline?'Year '+pmValue(v.year)+' · ':'')+pmValue(v.rawValue)+' · '+pmDimensions(v)+' · '+short(v.key)]);
  }
  function pmPair(indicator,period){
    if(!programme.draftPair||programme.draftPair.periodKey!==period.key){
      programme.draftPair={periodKey:period.key,targetKey:null,actualKey:period.actuals.length===1?period.actuals[0].key:'',
        baselineKey:null,operation:period.targets.length?'inspect':'baseline-change',note:''};
    }
    return programme.draftPair;
  }
  function pmCommitPair(indicator,chosen){
    if(!chosen.actualKey)throw new Error('Choose the exact actual observation.');
    if(chosen.operation==='baseline-change'){chosen.targetKey=null;if(!chosen.baselineKey)throw new Error('Choose the original baseline for this change.');}
    else if(!chosen.targetKey)throw new Error('Choose the original target for this comparison.');
    if(chosen.operation==='baseline-progress'&&!chosen.baselineKey)throw new Error('Choose the original baseline for progress to target.');
    if(chosen.operation!=='inspect'&&!chosen.note.trim())throw new Error('Describe the source basis for this calculation.');
    const original=programme.editingBinding;
    if(original&&!draft.bindings.some(b=>pmSameBinding(b,original)))throw new Error('The comparison being edited has changed. Open its current selection before editing.');
    if(original&&draft.bindings.some(b=>pmSameBinding(b,chosen)&&!pmSameBinding(b,original)))
      throw new Error('Another staged comparison already selects that period, target and actual. Edit that selection or choose a distinct observation.');
    if(!update(()=>{
      if(draft.selection.indicatorKeys.length&&!draft.selection.indicatorKeys.includes(indicator.key))draft.selection.indicatorKeys.push(indicator.key);
      draft.bindings=draft.bindings.filter(b=>!pmSameBinding(b,original||chosen));draft.bindings.push(structuredClone(chosen));
    }))return;
    programme.draftPair=null;programme.editingBinding=null;
    status(original?'The original comparison has been replaced with the edited selection.':'The exact observation comparison is staged in this programme draft.');render();
  }
  function pmWorksheet(holder,report){
    const choices=report.indicators.filter(pmMatches);
    const box=section('Indicator review worksheet');
    box.append(field('Original indicator',pmMark(select([['','Choose an indicator'],...choices.map(i=>[i.key,i.activityId+' · '+pmTitle(i)])],programme.indicatorKey,v=>{programme.indicatorKey=v;programme.periodKey='';programme.draftPair=null;programme.editingBinding=null;render();}),'worksheet-indicator')));
    const i=report.indicators.find(x=>x.key===programme.indicatorKey);
    if(!i){box.append(note('Select an indicator from the framework or the observations table.'));holder.append(box);return;}
    box.append(pmMark(el('h3',{textContent:pmTitle(i)}),'editor-title'));
    properties(box,{activity:i.activityId,result:i.resultTitle,measure:i.measureLabel,reportedAscending:i.ascending,reportedAggregation:i.aggregationStatus});
    const sourceContext=el('details'),summary=el('summary',{textContent:'Read the original wording and source context'});
    sourceContext.append(summary,el('pre',{textContent:JSON.stringify({titles:i.titles,descriptions:i.descriptions,resultTitle:i.resultTitle,
      references:i.references,documents:i.documents,source:i.source,locator:i.locator,attributes:i.attributes},null,2)}));box.append(sourceContext);
    const interpretation=draft.interpretations.find(v=>v.indicatorKey===i.key)||{unitLabel:'',direction:'reported',note:''};
    function meaning(name,value){
      update(()=>{let m=draft.interpretations.find(v=>v.indicatorKey===i.key);
        if(!m){m={indicatorKey:i.key,unitLabel:'',direction:'reported',note:''};draft.interpretations.push(m);}m[name]=value;});
    }
    box.append(row(field('Unit / quantity meaning',pmMark(textInput(interpretation.unitLabel,v=>meaning('unitLabel',v),{maxLength:160,placeholder:'Meaning supported by the source'}),'unit-meaning')),
      field('Direction of improvement',pmMark(select([['reported','Use reported direction'],['higher','Higher is better'],['lower','Lower is better'],['none','No directional conclusion']],interpretation.direction,v=>meaning('direction',v)),'unit-direction'))),
      field('Interpretation and source basis',pmMark(textarea(interpretation.note,v=>meaning('note',v),3),'interpretation-note')));
    if(i.baselines.length){
      const baseline=section('Original baselines');
      pmTable(baseline,[{label:'Year',key:'year'},{label:'Value',key:'rawValue',className:'number'},
        {label:'Population / location',render:pmDimensions},{label:'Date',key:'isoDate'},
        {label:'Comment',render:v=>(v.comments||[]).map(x=>x.text||'').join(' · ')}],i.baselines,{pageSize:50});box.append(baseline);
    }
    if(!i.periods.length){box.append(note('The source reports no periods for this indicator. Its baseline and original wording remain available.'));holder.append(box);return;}
    if(!i.periods.some(p=>p.key===programme.periodKey))programme.periodKey=i.periods[0].key;
    const p=i.periods.find(x=>x.key===programme.periodKey);
    box.append(field('Reporting period',pmMark(select(i.periods.map(v=>[v.key,pmPeriod(v)]),programme.periodKey,v=>{programme.periodKey=v;programme.draftPair=null;render();}),'worksheet-period')));
    const observed=section('Period observations');
    pmTable(observed,[{label:'Kind',key:'kind'},{label:'Value',key:'rawValue',className:'number'},
      {label:'Population / location',render:pmDimensions},{label:'Comment',render:v=>(v.comments||[]).map(x=>x.text||'').join(' · ')}],
      [...p.targets,...p.actuals],{pageSize:250});box.append(observed);
    if(!p.targets.length)box.append(pmMark(note('No target is reported for this period. An explicitly selected comparable baseline can support actual-minus-baseline change.'),'no-target-note'));
    if(p.actuals.length){
      const selected=pmPair(i,p),pair=section('Explicit observation comparison');
      const operations=[['inspect','Inspect target and actual'],['difference','Actual minus target'],['target-ratio','Actual / target × 100'],
        ['baseline-progress','Progress from baseline to target'],['baseline-change','Actual minus baseline']];
      pair.append(field('Calculation',pmMark(select(operations,selected.operation,v=>{selected.operation=v;if(v==='baseline-change')selected.targetKey=null;render();}),'pair-operation')),
        field('Actual observation',pmMark(select([['','Choose actual'],...pmRecordOptions(p.actuals)],selected.actualKey,v=>{selected.actualKey=v;}),'pair-actual')));
      const target=pmMark(select([['','Choose target'],...pmRecordOptions(p.targets)],selected.targetKey||'',v=>{selected.targetKey=v||null;}),'pair-target');disabled(target,selected.operation==='baseline-change');
      pair.append(field('Target observation',target),field('Baseline observation',pmMark(select([['','Choose baseline'],...pmRecordOptions(i.baselines,true)],selected.baselineKey||'',v=>{selected.baselineKey=v||null;}),'pair-baseline')),
        field('Comparison basis / reviewer instruction',pmMark(textarea(selected.note,v=>{selected.note=v;},3),'pair-note')),
        pmButton('Stage exact comparison',()=>run('Retaining the reviewed observation selection…',async()=>{pmCommitPair(i,selected);await persistDraft();}),'stage-comparison',true));
      if(programme.editingBinding)pair.append(note('Editing an existing comparison replaces its original observation selection.'),
        pmButton('Start another comparison',()=>{programme.editingBinding=null;programme.draftPair=null;render();},'new-pair'));
      box.append(pair);
    }
    const bindings=draft.bindings.filter(b=>i.periods.some(p=>p.key===b.periodKey));
    if(bindings.length){
      const staged=section('Staged comparisons for this indicator');
      pmTable(staged,[
        {label:'Operation',key:'operation'},
        {label:'Actual',render:b=>pmValue(i.periods.flatMap(p=>p.actuals).find(v=>v.key===b.actualKey)?.rawValue)},
        {label:'Target',render:b=>b.targetKey?pmValue(i.periods.flatMap(p=>p.targets).find(v=>v.key===b.targetKey)?.rawValue):'No selected target'},
        {label:'Baseline',render:b=>b.baselineKey?pmValue(i.baselines.find(v=>v.key===b.baselineKey)?.rawValue):'No selected baseline'},
        {label:'Basis',key:'note'},
        {label:'Edit',render:b=>row(pmButton('Edit selection',()=>{programme.periodKey=b.periodKey;programme.draftPair=structuredClone(b);programme.editingBinding=pmBindingIdentity(b);render();},'edit-pair'),
          pmButton('Remove selection',()=>{update(()=>{draft.bindings=draft.bindings.filter(x=>canonical(x)!==canonical(b));});
            if(programme.editingBinding&&pmSameBinding(programme.editingBinding,b)){programme.editingBinding=null;programme.draftPair=null;}render();},'remove-pair',true))}
      ],bindings,{pageSize:100});box.append(staged);
    }
    const findings=[...(i.findings||[]),...i.baselines.flatMap(v=>v.findings||[]),...(p.findings||[]),...[...p.targets,...p.actuals].flatMap(v=>v.findings||[])];
    if(findings.length)details(box,'Source findings for this worksheet',findings);
    box.append(row(pmButton('Build reviewed calculations',()=>run('Rebuilding the source-bound programme calculations…',pmBuild),'build-calculations'),
      pmButton('Open report and handover',()=>{programme.tab='report';render();},'open-programme-report')));
    holder.append(box);
  }
  function pmComparisonRows(report){
    return report.comparisons.map(value=>{
      const i=report.indicators.find(x=>x.key===value.indicatorKey),p=i?.periods.find(x=>x.key===value.periodKey),b=value.binding;
      return {...value,_key:b.periodKey+':'+b.actualKey+':'+b.targetKey,indicatorTitle:i?.title||value.indicatorKey,
        activity:i?.activityId,periodLabel:p?pmPeriod(p):value.periodKey,
        actual:p?.actuals.find(x=>x.key===b.actualKey),target:p?.targets.find(x=>x.key===b.targetKey),
        baseline:i?.baselines.find(x=>x.key===b.baselineKey)};
    });
  }
  function pmProgrammeReport(holder,report,currentReport){
    const reviewSection=section('Named programme review');
    reviewSection.append(row(field('Review state',pmMark(select([['draft','Draft'],['reviewed','Reviewed'],['needs-correction','Needs correction']],draft.review.status,v=>update(()=>{draft.review.status=v;})),'programme-review-status')),
      field('Reviewer',pmMark(textInput(draft.review.reviewer,v=>update(()=>{draft.review.reviewer=v;}),{maxLength:160}),'programme-reviewer'))),
      field('Review conclusion and source basis',pmMark(textarea(draft.review.note,v=>update(()=>{draft.review.note=v;}),4),'programme-review-note')));
    const save=pmButton(current?'Save programme revision':'Save programme',()=>run('Saving the complete reviewed programme edition…',async()=>{
      if(current&&current.revision!==currentHead)throw new Error('Open the current working head, or select the historical edition as working head in Review project.');
      await mutate('save',projectInput());activeTab='programme';programme.tab='report';render();
    }),'save-programme',true);
    disabled(save,Boolean(current&&current.revision!==currentHead));
    reviewSection.append(row(pmButton('Build current report',()=>run('Preparing current programme calculations…',pmBuild),'report-build'),save));
    holder.append(reviewSection);
    const calculations=section('Selected observation calculations');
    if(!currentReport)calculations.append(note('These calculations belong to the last prepared report. Build the current report after editing its review or selections.'));
    pmTable(calculations,[
      {label:'Activity / indicator',render:v=>(v.activity||'')+' · '+v.indicatorTitle},
      {label:'Period / population',render:v=>v.periodLabel+' · '+(v.actual?pmDimensions(v.actual):'')},
      {label:'Operation',render:v=>v.binding.operation},
      {label:'Actual',render:v=>pmValue(v.actual?.rawValue),className:'number'},
      {label:'Target',render:v=>v.target?pmValue(v.target.rawValue):'Not selected',className:'number'},
      {label:'Baseline',render:v=>v.baseline?pmValue(v.baseline.rawValue):'Not selected',className:'number'},
      {label:'Calculated value',render:v=>{const c=v.calculation;if(!c)return v.status;return v.binding.operation==='baseline-change'?'Change '+pmValue(c.actualMinusBaseline):
        v.binding.operation==='difference'?'Difference '+pmValue(c.actualMinusTarget):
        v.binding.operation==='inspect'?'Inspected':pmValue(c.ratioPercent)+'%';},className:'number'},
      {label:'Interpretation / findings',render:v=>[v.calculation?.differenceMeaning,v.calculation?.directionalBaselineRelation,...(v.reasons||[])].filter(Boolean).join(' · ')}
    ],pmComparisonRows(report),{pageSize:100});
    holder.append(calculations);
    const source=section('Programme source coverage');
    pmTable(source,[{label:'Source',render:x=>x.source.label||x.source.name},{label:'Activities',render:x=>x.sourceCounts.activities},
      {label:'Results',render:x=>x.sourceCounts.results},{label:'Indicators',render:x=>x.sourceCounts.indicators},
      {label:'Original source identity',render:x=>x.source.id}],report.coverage,{pageSize:32});
    details(source,'Complete report findings',report.findings);holder.append(source);
    const delivery=section('Saved programme report and editable handover');
    if(current&&!current.restoredDraft){
      delivery.append(note('Downloads select saved revision '+current.revision+' of '+current.definition.name+'.'),
        row(pmButton('Download programme report and CSVs',()=>run('Preparing the saved programme report…',()=>download(query('/report/export',{id:current.id,revision:current.revision}),'programme-report-r'+current.revision+'.zip')),'download-programme-report'),
          pmButton('Download complete editable programme',()=>run('Preparing the full original programme handover…',()=>download(query('/export',{id:current.id,revision:current.revision}),'programme-project-r'+current.revision+'.zip')),'download-programme-project'),
          pmButton('Review following edition',()=>{activeTab='compare';programme.compare.id=current.id;programme.compare.after=String(current.revision);render();},'following-edition')),
        identity('Saved edition '+current.sha256));
    }else delivery.append(note('Save or open a programme edition to download its complete report and editable source history.'));
    details(delivery,'Current prepared report',report);holder.append(delivery);
  }
  async function pmLoadComparison({restoring=false}={}){
    const c=programme.compare;if(!c.id)throw new Error('Choose the saved programme.');
    const before=Number(c.before),after=Number(c.after);
    if(!Number.isSafeInteger(before)||!Number.isSafeInteger(after)||before<1||after<1||before===after)throw new Error('Choose two distinct positive saved revisions.');
    const signature=canonical({id:c.id,before,after});
    const values=await Promise.all([get(query('/report',{id:c.id,revision:before})),get(query('/report',{id:c.id,revision:after}))]);
    if(signature!==canonical({id:c.id,before:Number(c.before),after:Number(c.after)}))throw new Error('The selected programme editions changed while reading.');
    const editions=values.map((value,index)=>{
      const edition=value.edition,revision=index===0?before:after;
      if(edition.id!==c.id||edition.revision!==revision||!/^[0-9a-f]{64}$/.test(edition.sha256))
        throw new Error('The returned report does not identify the exact selected saved edition.');
      return {id:edition.id,revision:edition.revision,sha256:edition.sha256};
    });
    if(c.editions&&canonical(c.editions)!==canonical(editions))
      throw new Error('The retained source correspondence belongs to different edition bytes. Its draft is preserved; reopen the original workspace and editions.');
    const beforeKeys=new Set(values[0].report.indicators.map(x=>x.key)),afterKeys=new Set(values[1].report.indicators.map(x=>x.key));
    const usedBefore=new Set(),usedAfter=new Set();
    for(const pair of c.pairs){
      if(!beforeKeys.has(pair.before)||!afterKeys.has(pair.after)||afterKeys.has(pair.before)||beforeKeys.has(pair.after)||
         usedBefore.has(pair.before)||usedAfter.has(pair.after)||typeof pair.note!=='string'||!pair.note.trim())
        throw new Error('A retained correspondence no longer selects a distinct original indicator in both editions. The complete draft is preserved for review.');
      usedBefore.add(pair.before);usedAfter.add(pair.after);
    }
    c.beforeReport=values[0];c.afterReport=values[1];c.identity=signature;c.editions=editions;c.restoreError='';
    if(!restoring){await persistDraft();render();status('Both exact programme editions are open; staged source correspondence is retained.');}
  }
  function pmRenderCompare(){
    const c=programme.compare;
    if(!c.id)c.id=current?.id??inventory.projects[0]?.id??'';
    const selection=section('Following programme edition');
    const change=(key,value)=>{if(c[key]===value)return;c[key]=value;c.beforeReport=null;c.afterReport=null;c.identity=null;
      c.editions=null;c.pairs=[];c.beforeKey='';c.afterKey='';c.note='';c.restoreError='';};
    selection.append(field('Saved programme',pmMark(select([['','Choose programme'],...inventory.projects.map(v=>[v.id,v.name+' · r'+v.revision])],c.id,v=>{change('id',v);c.history=null;render();}),'compare-programme')),
      row(field('Earlier revision',pmMark(textInput(c.before,v=>change('before',v),{type:'number',min:'1'}),'compare-before')),
        field('Following revision',pmMark(textInput(c.after,v=>change('after',v),{type:'number',min:'1'}),'compare-after'))),
      row(pmButton('Open both reports',()=>run('Reading both complete saved programme reports…',pmLoadComparison),'open-comparison-reports'),
        pmButton('Read programme history',()=>run('Reading saved programme history…',async()=>{c.history=await get(query('/history',{id:c.id}));render();}),'comparison-history'),
        pmButton('Read saved comparisons',()=>run('Reading saved programme comparisons…',async()=>{
          const result=await get(query('/comparisons',{id:c.id}));c.saved=result.comparisons;render();
        }),'existing-comparisons')));
    if(c.history){
      const histories=el('div',{className:'pm-history'});
      for(const edition of c.history.editions){
        const card=el('article');card.append(el('strong',{textContent:'Revision '+edition.revision+' · '+edition.definition.review.status}),
          note(edition.definition.review.reviewer+' · '+edition.definition.review.note),
          row(button('Use as earlier',()=>{change('before',String(edition.revision));render();}),
              button('Use as following',()=>{change('after',String(edition.revision));render();})));histories.append(card);
      }
      selection.append(histories);
    }
    if(c.saved?.length)selection.append(row(...c.saved.map(item=>button('Open r'+item.beforeRevision+' → r'+item.afterRevision,()=>{compared=item;render();}))));
    if(c.restoreError){selection.append(pmMark(note(c.restoreError),'comparison-restore-error'));
      details(selection,'Retained source correspondence draft',{programme:c.id,before:c.before,after:c.after,editions:c.editions,pairs:c.pairs});}
    body.append(selection);
    if(c.beforeReport&&c.afterReport){
      const before=c.beforeReport.report,after=c.afterReport.report,box=section('Explicit source correspondence');
      const sameKeys=before.indicators.filter(x=>after.indicators.some(y=>y.key===x.key));
      const mappedBefore=new Set(c.pairs.map(x=>x.before)),mappedAfter=new Set(c.pairs.map(x=>x.after));
      const beforeRows=before.indicators.filter(x=>!sameKeys.some(y=>y.key===x.key)&&!mappedBefore.has(x.key));
      const afterRows=after.indicators.filter(x=>!sameKeys.some(y=>y.key===x.key)&&!mappedAfter.has(x.key));
      const label=i=>i.activityId+' · '+i.title+' · '+short(i.source)+' / '+short(i.key);
      box.append(note(sameKeys.length+' unchanged source identities correspond directly. '+beforeRows.length+' earlier and '+afterRows.length+' following indicators remain available for explicit correspondence.'),
        row(field('Earlier source indicator',pmMark(select([['','Choose original indicator'],...beforeRows.map(i=>[i.key,label(i)])],c.beforeKey,v=>{c.beforeKey=v;}),'map-before')),
          field('Following source indicator',pmMark(select([['','Choose following indicator'],...afterRows.map(i=>[i.key,label(i)])],c.afterKey,v=>{c.afterKey=v;}),'map-after'))),
        field('Source relationship and mapping basis',pmMark(textarea(c.note,v=>{c.note=v;},3),'mapping-note')),
        pmButton('Stage source correspondence',()=>{
          if(!c.beforeKey||!c.afterKey||!c.note.trim()){status('Select both original indicator identities and record their relationship.',true);return;}
          c.pairs.push({before:c.beforeKey,after:c.afterKey,note:c.note});c.beforeKey='';c.afterKey='';c.note='';render();
        },'stage-source-map'));
      if(c.pairs.length)pmTable(box,[
        {label:'Earlier',render:v=>label(before.indicators.find(x=>x.key===v.before))},
        {label:'Following',render:v=>label(after.indicators.find(x=>x.key===v.after))},
        {label:'Mapping basis',key:'note'},
        {label:'Edit',render:v=>button('Remove mapping',()=>{c.pairs=c.pairs.filter(x=>x!==v);render();})}
      ],c.pairs,{pageSize:100});
      box.append(pmButton('Save programme comparison',()=>run('Saving the exact source and review comparison…',async()=>{
        const expected=canonical({id:c.id,before:Number(c.before),after:Number(c.after)});
        if(c.identity!==expected)throw new Error('Open the current two reports before saving their correspondence.');
        await mutate('compare',{id:c.id,beforeRevision:Number(c.before),afterRevision:Number(c.after),pairs:structuredClone(c.pairs)});
      }),'save-programme-comparison',true));
      details(box,'Earlier programme source and review',{edition:c.beforeReport.edition,coverage:before.coverage,selection:before.selection});
      details(box,'Following programme source and review',{edition:c.afterReport.edition,coverage:after.coverage,selection:after.selection});body.append(box);
    }
    if(compared){
      const saved=section('Saved programme edition comparison');
      properties(saved,{project:compared.project,beforeRevision:compared.beforeRevision,afterRevision:compared.afterRevision,
        selectionChanged:compared.comparison.selectionChanged,interpretationChanged:compared.comparison.interpretationChanged});
      pmTable(saved,[{label:'Earlier indicator',key:'before'},{label:'Following indicator',key:'after'},{label:'Basis',key:'note'},
        {label:'Changed fields',render:v=>(v.changedFields||[]).join(', ')},{label:'Original values changed',key:'originalValuesChanged'},
        {label:'Selected values changed',key:'selectedValuesChanged'}],compared.comparison.pairs,{pageSize:100});
      properties(saved,{removedIndicators:compared.comparison.removedIndicators,addedIndicators:compared.comparison.addedIndicators});
      details(saved,'Complete saved comparison',compared);body.append(saved);
    }
  }
  async function openProject(id,revision){
    const selected=await get(query('/project',{id,revision}));if(current?.id!==selected.id)pmResetView();
    current=selected;draft=structuredClone(current.definition);preview=current.report;pmRemember(preview);
    currentHead=inventory.projects.find(v=>v.id===id)?.revision??null;persistDraft();render();
  }
  function newProject(){
    current=null;currentHead=null;draft=emptyDraft();preview=null;compared=null;
    programme.report=null;programme.definition=null;pmResetView();
    if(pickedSource)draft.sources=[pickedSource];periodChoices.clear();persistDraft();render();
  }
  function projectInput(){const value=structuredClone(draft);if(current){value.id=current.id;value.expectedRevision=current.revision;}return value;}
  function renderProject(){
    const saved=section('Saved project and immutable history');
    let id=current?.id??inventory.projects[0]?.id??'';
    saved.append(row(field('Results project',select([['','Choose a saved project'],...inventory.projects.map(v=>[v.id,v.name+' · r'+v.revision+' · '+v.review.status])],id,v=>{id=v;})),
      button('Open current head',()=>run('Opening the original saved results head…',()=>openProject(id))),
      mutationButton('New project',newProject),button('Refresh saved inventory',()=>run('Reading the original results inventory…',refresh))));
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
    const comparisons=el('div');table(comparisons,['indicator','period','operation','status','actualMinusTarget','actualMinusBaseline','differenceMeaning','directionalBaselineRelation','ratioPercent','ratioFormula','reasons'],
      value.comparisons.map(v=>({indicator:v.indicatorKey,period:v.periodKey,operation:v.binding.operation,status:v.status,
        actualMinusTarget:v.calculation?.actualMinusTarget,actualMinusBaseline:v.calculation?.actualMinusBaseline,differenceMeaning:v.calculation?.differenceMeaning,
        directionalBaselineRelation:v.calculation?.directionalBaselineRelation,
        ratioPercent:v.calculation?.ratioPercent,ratioFormula:v.calculation?.ratioFormula,reasons:v.reasons})));s.append(comparisons);
    const coverage=el('div');table(coverage,['source','projectionSha256','sourceCounts'],value.coverage);s.append(el('h3',{textContent:'Exact publisher coverage'}),coverage);
    details(s,'Original activity, result and location context',{activities:value.activities,results:value.results});
    const findings=el('div');table(findings,['source','locator','code','message'],value.findings);s.append(el('h3',{textContent:'Source and comparability findings'}),findings);
    details(s,'Complete original report JSON',value);body.append(s);
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
  for(const event of ['input','change','click'])panel.addEventListener(event,capture);
  return {buttons,refresh,show};
};
