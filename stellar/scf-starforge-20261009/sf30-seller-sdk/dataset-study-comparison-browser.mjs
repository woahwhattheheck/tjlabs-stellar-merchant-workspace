// MIT. Complete result comparison in the original local dataset-study browser.
import {suggestComparisonFields,validateComparisonPlan,COMPARISON_KINDS} from '/dataset-study-comparison-core.mjs';
const WORKING_SCHEMA='stellar-forge.dataset-study-comparison-working.v1';
const MAX_WORKING=8*1024*1024;
const MAX_ARCHIVED_WORKING=MAX_WORKING-64*1024;
const clone=value=>JSON.parse(JSON.stringify(value));
const uuid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const node=(tag,value,className)=>{
  const result=document.createElement(tag);
  if(value!==undefined)result.textContent=String(value);
  if(className)result.className=className;
  return result;
};
const option=(label,value)=>{const result=node('option',label);result.value=value;return result;};
const label=(caption,control)=>{const result=node('label',caption);result.append(control);return result;};
const button=caption=>{const result=node('button',caption);result.type='button';return result;};
const details=(caption,value)=>{
  const result=node('details');result.append(node('summary',caption),node('pre',typeof value==='string'?value:JSON.stringify(value,null,2)));
  return result;
};
const fileSize=value=>new TextEncoder().encode(JSON.stringify(value)+'\n').length;
const scalar=value=>!value.present?'Absent field':value.value===null?'null ('+value.type+')':
  JSON.stringify(value.value)+' ('+value.type+')';
const emptyDraft=()=>({title:'',baselineId:'',targetId:'',selection:null,fields:[],request:null});
function workingFile(value,workspaceId){
  if(!value||value.schema!==WORKING_SCHEMA||value.workspaceId!==workspaceId||
    !value.draft||!Array.isArray(value.history)||!Array.isArray(value.pending)||fileSize(value)>MAX_ARCHIVED_WORKING)
    throw new Error('Open a complete comparison working file from this original study workspace (up to 8 MiB).');
  const draft=d=>{
    if(!d||typeof d.title!=='string'||d.title.length>160||typeof d.baselineId!=='string'||typeof d.targetId!=='string'||
      !Array.isArray(d.fields)||d.fields.length>128||!d.fields.every(f=>f&&
        (f.baseline===null||typeof f.baseline==='string')&&(f.target===null||typeof f.target==='string')&&typeof f.key==='boolean'))
      throw new Error('The complete comparison draft is invalid.');
    if(d.selection!==null&&(!d.selection||d.selection.workspaceId!==workspaceId||
      !Array.isArray(d.selection.baseline?.columns)||!Array.isArray(d.selection.target?.columns)||
      d.selection.baseline.id!==d.baselineId||d.selection.target.id!==d.targetId))
      throw new Error('Keep the exact original result selections with this mapping.');
    if(d.request!==null&&(!d.request||typeof d.request.id!=='string'))
      throw new Error('Keep the original comparison request identity.');
  };
  draft(value.draft);
  for(const item of value.history){if(!item||typeof item.at!=='string'||typeof item.reason!=='string')throw new Error('Keep complete draft history.');draft(item.draft);}
  for(const item of value.pending)if(!item||typeof item.id!=='string'||!item.request||item.id!==item.request.id)
    throw new Error('Keep each original pending request.');
  return clone(value);
}
export function mountDatasetStudyComparisons({root,api,downloadFile}){
  if(!root||typeof api!=='function'||typeof downloadFile!=='function')throw new TypeError('Use the original study browser owner.');
  const heading=node('h2','Compare saved query results');
  const intro=node('p','Compare two complete retained results. Choose matching fields and row keys, then inspect all changes and unresolved key groups. Original queries, snapshots and values remain with each saved comparison.','help');
  const status=node('p','Loading the original study workspace…','help');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const warning=node('p','','help');warning.setAttribute('role','status');
  const title=node('input');title.type='text';title.maxLength=160;title.autocomplete='off';
  const baseline=node('select'),target=node('select'),inspect=button('Read selected results'),refresh=button('Refresh saved results');
  const selectors=node('div',undefined,'row');selectors.append(label('Earlier complete result',baseline),label('Later complete result',target),inspect,refresh);
  const binding=node('div'),mapping=node('div'),create=button('Save complete comparison');
  const downloadWorking=button('Download comparison working file'),openWorking=button('Open working file'),recover=button('Recover browser draft');
  const files=node('input');files.type='file';files.accept='.json,application/json';files.hidden=true;
  const actions=node('div',undefined,'row');actions.append(create,downloadWorking,openWorking,recover,files);
  const draftHistory=node('select'),restore=button('Restore draft edition');
  const historyRow=node('div',undefined,'row');historyRow.append(label('Earlier draft editions',draftHistory),restore);
  const pending=node('select'),retry=button('Recover original request');
  const pendingRow=node('div',undefined,'row');pendingRow.append(label('Retained comparison requests',pending),retry);
  const incoming=node('div');incoming.hidden=true;const incomingText=node('p',undefined,'help'),applyIncoming=button('Open complete working file');
  incoming.append(incomingText,applyIncoming);
  const saved=node('select'),openSaved=button('Open saved comparison'),refreshSaved=button('Refresh comparisons');
  const savedRow=node('div',undefined,'row');savedRow.append(label('Saved comparisons',saved),openSaved,refreshSaved);
  const report=node('section');report.setAttribute('aria-label','Saved comparison');
  root.replaceChildren(heading,intro,status,warning,label('Comparison name',title),selectors,binding,mapping,actions,historyRow,pendingRow,incoming,savedRow,report);
  let workspaceId=null,state=null,generation=0,viewGeneration=0,busy=false,current=null,currentPage=null;
  let pendingImport=null,recovery=null,disposed=false,pollTimer=null,draftInstalled=false,fileGeneration=0;
  const mappingControls=[];
  const message=(value,error=false)=>{status.textContent=value;status.className=error?'error':'help';};
  const recoveryKey=()=> 'sf30-dataset-comparison:'+workspaceId;
  function capture(){
    if(!state||!draftInstalled)return;
    const d=state.draft,old=JSON.stringify({title:d.title,baselineId:d.baselineId,targetId:d.targetId,fields:d.fields});
    d.title=title.value;d.baselineId=baseline.value;d.targetId=target.value;
    if(d.selection&&mappingControls.length)d.fields=mappingControls.map(item=>({
      baseline:item.baseline,target:item.target?(item.target.value||null):(item.fixedTarget??null),key:item.key?.checked??false}));
    const changed=old!==JSON.stringify({title:d.title,baselineId:d.baselineId,targetId:d.targetId,fields:d.fields});
    if(changed){d.request=null;generation++;}
  }
  function remember(){
    if(!state)return;
    try{
      if(fileSize(state)>MAX_WORKING)throw new Error('The complete draft history exceeds 8 MiB. Download the current working file and begin a separate draft.');
      localStorage.setItem(recoveryKey(),JSON.stringify(state));warning.textContent='';
    }catch(error){warning.textContent='Browser recovery could not be saved. Your current work remains on screen; Download comparison working file retains it. '+error.message;}
  }
  function capacity(value){
    if(fileSize(value)>MAX_ARCHIVED_WORKING)throw new Error('This complete draft history is full. Download its working file before starting a separate comparison draft; current work and original requests remain intact.');
    return value;
  }
  function archivedState(reason){
    capture();const next=clone(state),d=state.draft;
    if(d.selection||d.title||d.fields.length)next.history.push({at:now(),reason,draft:clone(d)});
    return next;
  }
  function archive(reason){state=capacity(archivedState(reason));}
  function controls(){
    for(const item of [inspect,refresh,create,restore,retry,openSaved,refreshSaved,applyIncoming])item.disabled=busy||!state;
    create.disabled=busy||!state?.draft.selection;
    restore.disabled=busy||!draftHistory.value;
    retry.disabled=busy||!pending.value;
    openSaved.disabled=busy||!saved.value;
    recover.disabled=busy||!recovery;
    downloadWorking.disabled=!state;openWorking.disabled=!state;
  }
  function setOptions(select,items,selected,empty){
    select.replaceChildren(option(empty,''));
    for(const item of items)select.append(option(item.label,item.value));
    if(selected&&!items.some(item=>item.value===selected))select.append(option('Previously selected · '+selected,selected));
    select.value=selected||'';
  }
  function renderHistory(){
    const old=draftHistory.value;
    setOptions(draftHistory,state.history.map((item,index)=>({value:String(index),label:item.at+' · '+item.reason+' · '+(item.draft.title||'Untitled comparison')})),old,'Choose a draft edition');
    setOptions(pending,state.pending.map(item=>({value:item.id,label:item.id+' · '+item.request.title})),pending.value,'Choose an original request');
    controls();
  }
  function renderBinding(){
    binding.replaceChildren();const selection=state?.draft.selection;if(!selection)return;
    const sources=node('div',undefined,'row');
    for(const [caption,value] of [['Earlier',selection.baseline],['Later',selection.target]]){
      const part=node('div');part.append(node('h3',caption+' · '+(value.title||value.id)),
        node('p',value.rows+' complete rows · '+value.columns.length+' selected fields','help'),
        details('Original query, source and snapshot',value));sources.append(part);
    }
    binding.append(sources);
    const differences=[];
    if(selection.baseline.snapshot!==selection.target.snapshot)differences.push('snapshots differ');
    if(selection.baseline.query!==selection.target.query)differences.push('queries differ');
    if(JSON.stringify(selection.baseline.source)!==JSON.stringify(selection.target.source))differences.push('source descriptions differ');
    binding.append(node('p',differences.length?'Selection differences: '+differences.join('; ')+'. Changes describe these complete selected results; inspect both query definitions when interpreting them.':
      'Both selections retain their original query and source definitions.','help'));
  }
  function normalizeUnpaired(){
    const d=state.draft;if(!d.selection)return;
    const mapped=d.fields.filter(item=>item.baseline!==null),used=new Set(mapped.map(item=>item.target).filter(Boolean));
    d.fields=[...mapped,...d.selection.target.columns.filter(item=>!used.has(item.name)).map(item=>({baseline:null,target:item.name,key:false}))];
  }
  function renderMapping(){
    mapping.replaceChildren();mappingControls.length=0;
    const d=state?.draft;if(!d?.selection)return;
    const table=node('table'),head=node('thead'),tr=node('tr');
    for(const value of ['Earlier field','Later field','Use as row key'])tr.append(node('th',value));head.append(tr);table.append(head);
    const body=node('tbody'),before=new Map(d.selection.baseline.columns.map(x=>[x.name,x])),after=new Map(d.selection.target.columns.map(x=>[x.name,x]));
    for(const field of d.fields){
      const row=node('tr'),first=node('td'),second=node('td'),third=node('td');
      const left=before.get(field.baseline),right=after.get(field.target);
      first.textContent=left?left.name+' · '+left.type:'Absent earlier';
      let selected=null,key=null;
      if(left){
        selected=node('select');selected.setAttribute('aria-label','Later field for '+left.name);
        selected.append(option('Absent later',''));
        for(const spec of d.selection.target.columns)selected.append(option(spec.name+' · '+spec.type,spec.name));
        selected.value=field.target||'';
        selected.addEventListener('change',()=>{capture();normalizeUnpaired();renderMapping();remember();});
        second.append(selected);
        key=node('input');key.type='checkbox';key.checked=field.key;key.setAttribute('aria-label','Use '+left.name+' as row key');
        key.addEventListener('change',()=>{capture();remember();});third.append(key);
      }else second.textContent=right?right.name+' · '+right.type:'Missing original field';
      mappingControls.push({baseline:field.baseline,target:selected,fixedTarget:field.target,key});
      row.append(first,second,third);body.append(row);
    }
    table.append(body);const scroll=node('div',undefined,'scroll');scroll.append(table);
    mapping.append(node('h3','Match every selected field'),node('p','Each original field appears once. Pair renamed fields explicitly; leave an absent field unpaired. Key columns need the same type on both sides. Duplicate and null keys remain complete unresolved groups.','help'),scroll);
  }
  function installDraft(){
    title.value=state.draft.title;
    if(state.draft.baselineId&&!Array.from(baseline.options).some(x=>x.value===state.draft.baselineId))baseline.append(option('Retained result · '+state.draft.baselineId,state.draft.baselineId));
    if(state.draft.targetId&&!Array.from(target.options).some(x=>x.value===state.draft.targetId))target.append(option('Retained result · '+state.draft.targetId,state.draft.targetId));
    baseline.value=state.draft.baselineId;target.value=state.draft.targetId;draftInstalled=true;
    renderBinding();renderMapping();renderHistory();remember();controls();
  }
  async function refreshResults(){
    const value=await api('/api/studies/exports');
    if(disposed)return;
    capture();
    const choices=(value.exports||[]).filter(x=>x.status==='COMPLETE').map(x=>({value:x.id,
      label:(x.title||x.studyId||x.id)+' · '+x.rows+' rows · '+(x.createdAt||'')+' · '+x.id.slice(0,12)}));
    setOptions(baseline,choices,state?.draft.baselineId,'Choose earlier complete result');
    setOptions(target,choices,state?.draft.targetId,'Choose later complete result');
    if(!choices.length)message('Complete a retained result with Export all matching rows, then refresh this list.');
  }
  async function refreshComparisons(){
    const value=await api('/api/studies/comparisons');
    if(disposed)return;
    if(workspaceId&&workspaceId!==value.workspaceId)throw new Error('The original study workspace changed. Keep this working file and reopen its source workspace.');
    if(!workspaceId){
      workspaceId=value.workspaceId;
      state={schema:WORKING_SCHEMA,workspaceId,draft:emptyDraft(),history:[],pending:[]};
      try{const raw=localStorage.getItem(recoveryKey());if(raw){recovery=workingFile(JSON.parse(raw),workspaceId);state=clone(recovery);}}
      catch(error){warning.textContent='An earlier browser draft could not be read: '+error.message;}
    }
    setOptions(saved,(value.comparisons||[]).map(x=>({value:x.id,label:(x.title||x.id)+' · '+x.createdAt})),saved.value,'Choose a complete saved comparison');
    if(value.warnings?.length)warning.textContent='Some saved comparisons need attention: '+JSON.stringify(value.warnings);
    controls();
  }
  function memberView(comparison,group,side){
    const container=node('div'),summary=node('p',(side==='baseline'?group.baselineCount:group.targetCount)+' original rows','help');
    const content=node('div'),load=button('Inspect '+(side==='baseline'?'earlier':'later')+' original rows');
    container.append(summary,load,content);
    let memberGeneration=0;
    async function readMembers(offset){
      const admitted=++memberGeneration,ownerGeneration=viewGeneration;load.disabled=true;
      try{
        const value=await api('/api/studies/comparisons/members',{id:comparison.id,ordinal:group.ordinal,side,offset,limit:10});
        if(disposed||admitted!==memberGeneration||ownerGeneration!==viewGeneration)return;
        if(value.comparisonId!==comparison.id||value.comparisonSha256!==comparison.sha256)
          throw new Error('The original saved comparison changed while its rows were loading.');
        content.replaceChildren();
        for(const row of value.rows)content.append(details('Original row '+(row.ordinal+1),row.values));
        if(value.page.oversized)content.append(node('p','An original row exceeds the screen response allowance. Download the complete '+(side==='baseline'?'baseline.jsonl':'target.jsonl')+' above to inspect its complete value.','help'));
        const earlier=button('Previous original rows'),later=button('Next original rows');
        earlier.disabled=value.page.offset===0;later.disabled=value.page.nextOffset===null;
        earlier.addEventListener('click',()=>readMembers(Math.max(0,value.page.offset-value.page.limit)));
        later.addEventListener('click',()=>readMembers(value.page.nextOffset));
        const nav=node('div',undefined,'row');nav.append(earlier,later);
        content.append(node('p',value.page.total===0?'No original rows on this side.':
          'Original rows '+(value.rows.length?value.page.offset+1:0)+'–'+(value.page.offset+value.rows.length)+' of '+value.page.total+'.','help'),nav);
      }catch(error){if(!disposed&&admitted===memberGeneration){content.replaceChildren(node('p',error.message,'error'));}}
      finally{if(admitted===memberGeneration)load.disabled=false;}
    }
    load.addEventListener('click',()=>readMembers(0));return container;
  }
  function renderReport(value){
    clearTimeout(pollTimer);current=value.comparison;currentPage=value.page;report.replaceChildren();
    const c=current,p=currentPage;
    report.append(node('h3',c.title||'Saved comparison'),node('p',c.createdAt+' · '+c.id,'help'));
    if(c.status!=='COMPLETE'){
      report.append(node('p','Comparison status: '+c.status+'. Both original selections and the exact request remain saved.','help'),
        details('Retained original comparison request and source selections',c));
      if(c.error)report.append(node('p',c.error.message||JSON.stringify(c.error),'error'));
      const refreshStatus=button('Refresh comparison status'),resume=button('Resume original comparison');
      refreshStatus.addEventListener('click',()=>readComparison(c.id).catch(error=>message(error.message,true)));
      resume.disabled=c.status==='RUNNING';
      resume.addEventListener('click',()=>act(async()=>{
        const admitted=++viewGeneration,result=await api('/api/studies/comparisons/resume',{id:c.id});
        if(!disposed&&admitted===viewGeneration)renderReport(result);
      }));
      const row=node('div',undefined,'row');row.append(refreshStatus,resume);report.append(row);
      if(c.status==='RUNNING'){
        const admitted=viewGeneration;
        pollTimer=setTimeout(async()=>{
          try{if(!disposed&&admitted===viewGeneration)await readComparison(c.id);}
          catch(error){message(error.message+' The original request remains retained; refresh or resume this comparison.',true);}
        },1000);
      }
      return;
    }
    const totals=node('table'),body=node('tbody');
    for(const [caption,count] of [
      ['Earlier original rows',c.rowCounts?.baseline??c.baseline?.rows],['Later original rows',c.rowCounts?.target??c.target?.rows],
      ['Added key groups',c.counts?.added],['Removed key groups',c.counts?.removed],['Changed key groups',c.counts?.changed],
      ['Unchanged key groups',c.counts?.unchanged],['Unresolved key groups',c.counts?.ambiguous],
      ['Earlier rows in unresolved groups',c.rowCounts?.ambiguousBaseline],['Later rows in unresolved groups',c.rowCounts?.ambiguousTarget],
      ['Matched rows at another result position',c.moved]]){
      const row=node('tr');row.append(node('th',caption),node('td',count??0));body.append(row);
    }
    totals.append(body);report.append(totals);
    report.append(node('p','Changed and unchanged counts describe uniquely matched keys. Unresolved groups retain every original row without choosing a match. Movement records result order separately; inspect the original sort and queries before interpreting it.','help'));
    report.append(details('Complete saved selection, mapping and file identities',c));
    const downloads=node('div',undefined,'row');
    for(const file of c.files||[]){
      const b=button('Download '+file.name);b.addEventListener('click',async()=>{
        b.disabled=true;
        try{await downloadFile('/api/studies/comparisons/'+encodeURIComponent(c.id)+'/files/'+encodeURIComponent(file.name),file.name);
          message('Downloaded complete '+file.name+' from comparison '+c.id+'.');}
        catch(error){message(error.message,true);}finally{b.disabled=false;}
      });downloads.append(b);
    }
    report.append(downloads);
    const filters=node('select');for(const kind of COMPARISON_KINDS)filters.append(option(kind==='ambiguous'?'Unresolved keys':kind==='moved'?'Moved rows':kind[0].toUpperCase()+kind.slice(1),kind));
    filters.value=p.kind;
    filters.addEventListener('change',()=>readComparison(c.id,filters.value,0).catch(error=>message(error.message,true)));
    const previous=button('Previous comparison page'),next=button('Next comparison page');
    previous.disabled=p.offset===0;next.disabled=p.nextOffset===null;
    previous.addEventListener('click',()=>readComparison(c.id,p.kind,Math.max(0,p.offset-p.limit)).catch(error=>message(error.message,true)));
    next.addEventListener('click',()=>readComparison(c.id,p.kind,p.nextOffset).catch(error=>message(error.message,true)));
    const nav=node('div',undefined,'row');nav.append(label('Comparison rows',filters),previous,next);
    report.append(nav,node('p',p.total===0?'No groups in this view.':'Groups '+(p.offset+1)+'–'+(p.offset+p.rows.length)+' of '+p.total+' in this view.','help'));
    const table=node('table'),head=node('thead'),hr=node('tr');
    for(const caption of ['Kind / key','Earlier rows','Later rows','Changed fields / original values'])hr.append(node('th',caption));
    head.append(hr);table.append(head);const tbody=node('tbody');
    for(const item of p.rows){
      const tr=node('tr'),a=node('td'),b=node('td'),d=node('td'),e=node('td');
      a.append(node('strong',item.kind==='ambiguous'?'Unresolved':item.kind),node('pre',JSON.stringify(item.key,null,2)));
      if(item.moved)a.append(node('p','Result position changed','help'));
      if(item.reasons?.length)a.append(node('p',item.reasons.join(', '),'help'));
      if(item.keyTruncated)a.append(node('p','Long key shortened on screen; complete key remains in rows.jsonl.','help'));
      if(item.wholeFileAvailable){
        b.append(memberView(c,item,'baseline'));d.append(memberView(c,item,'target'));
        e.append(node('p',item.message||'Large original group: inspect each side here or download complete rows.jsonl.','help'));
      }
      for(const [cell,rows] of [[b,item.baseline],[d,item.target]]){
        if(!rows)continue;
        if(!rows.length)cell.append(node('span','No row'));
        for(const row of rows)cell.append(details('Original row '+(row.ordinal+1),row.values));
      }
      for(const change of item.changes||[]){
        const part=node('div');part.append(node('strong',(change.baselineName||'Absent')+' → '+(change.targetName||'Absent')),
          node('pre',scalar(change.before)+'\n→ '+scalar(change.after)));e.append(part);
      }
      if(!item.wholeFileAvailable&&!item.changes?.length)e.append(node('span',item.kind==='ambiguous'?'Inspect every original row; no pair was chosen.':'No changed typed values.'));
      tr.append(a,b,d,e);tbody.append(tr);
    }
    table.append(tbody);const scroll=node('div',undefined,'scroll');scroll.append(table);report.append(scroll);
  }
  async function readComparison(id,kind='all',offset=0){
    const admitted=++viewGeneration;
    message('Reading saved comparison '+id+'…');
    const value=await api('/api/studies/comparisons/read',{id,kind,offset,limit:25});
    if(disposed||admitted!==viewGeneration)return;
    renderReport(value);saved.value=id;message(value.comparison.status==='COMPLETE'?'Saved complete comparison opened. Your editable draft remains above.':'Saved comparison '+value.comparison.status.toLowerCase()+'. Your editable draft remains above.');
  }
  async function act(operation){
    if(busy||!state)return;busy=true;controls();
    try{await operation();}catch(error){message(error.message,true);}
    finally{busy=false;controls();}
  }
  async function submit(request){
    message('Starting comparison '+request.id+'. The native workspace retains the complete accepted request; Saved comparisons reopens it after an interrupted response.');
    const admitted=++viewGeneration;
    let value;
    try{value=await api('/api/studies/comparisons/create',request);}
    catch(error){
      await refreshComparisons().catch(()=>{});
      throw new Error(error.message+' Refresh Saved comparisons to recover an accepted request '+request.id+', or recover this same retained request to retry.');
    }
    if(disposed)return;
    if(admitted===viewGeneration)renderReport(value);
    await refreshComparisons();saved.value=value.comparison.id;
    message(value.comparison.status==='COMPLETE'?'Complete comparison saved as '+value.comparison.id+'. All original rows and the full report are available below.':'Original comparison request '+value.comparison.id+' is retained and '+value.comparison.status.toLowerCase()+'.');remember();
  }
  inspect.addEventListener('click',()=>act(async()=>{
    capture();if(!state.draft.baselineId||!state.draft.targetId)throw new Error('Choose two complete retained results.');
    const start=generation,selected={baselineId:state.draft.baselineId,targetId:state.draft.targetId};
    const value=await api('/api/studies/comparisons/inspect',selected);
    if(disposed)return;
    if(start!==generation)throw new Error('Your draft changed while the source selections were loading. It remains intact; read the selected results again.');
    if(value.workspaceId!==workspaceId)throw new Error('The source selections belong to another study workspace.');
    const next=archivedState('Before reading another pair of complete results');
    next.draft.selection=clone(value);next.draft.fields=clone(value.fields??suggestComparisonFields({
      baselineColumns:value.baseline.columns,targetColumns:value.target.columns}));
    next.draft.request=null;state=capacity(next);generation++;installDraft();
    message('Both complete source selections are retained. Review every mapping and choose row keys.');
  }));
  refresh.addEventListener('click',()=>act(refreshResults));
  refreshSaved.addEventListener('click',()=>act(refreshComparisons));
  title.addEventListener('input',()=>{capture();remember();});
  for(const selector of [baseline,target])selector.addEventListener('change',()=>{
    capture();
    try{
      if(state.draft.selection&&(state.draft.selection.baseline.id!==state.draft.baselineId||state.draft.selection.target.id!==state.draft.targetId)){
        const next=clone(state),prior=clone(state.draft);prior.baselineId=prior.selection.baseline.id;prior.targetId=prior.selection.target.id;
        next.history.push({at:now(),reason:'Before changing selected result',draft:prior});
        next.draft.selection=null;next.draft.fields=[];next.draft.request=null;state=capacity(next);
        renderBinding();renderMapping();renderHistory();
      }
      remember();
    }catch(error){
      if(state.draft.selection){state.draft.baselineId=state.draft.selection.baseline.id;state.draft.targetId=state.draft.selection.target.id;
        baseline.value=state.draft.baselineId;target.value=state.draft.targetId;}
      remember();message(error.message,true);
    }
    controls();
  });
  create.addEventListener('click',()=>act(async()=>{
    capture();const d=state.draft;
    if(!d.title.trim())throw new Error('Give this saved comparison a name.');
    if(!d.selection||d.baselineId!==d.selection.baseline.id||d.targetId!==d.selection.target.id)
      throw new Error('Read these exact source selections before comparing.');
    validateComparisonPlan({baselineColumns:d.selection.baseline.columns,targetColumns:d.selection.target.columns,fields:d.fields});
    const body={title:d.title,baselineId:d.baselineId,targetId:d.targetId,
      baselineSha256:d.selection.baseline.manifestSha256,targetSha256:d.selection.target.manifestSha256,fields:clone(d.fields)};
    if(!d.request)d.request={id:uuid(),...body};
    const request=clone(d.request);
    if(JSON.stringify({...request,id:undefined})!==JSON.stringify({...body,id:undefined}))throw new Error('The retained request differs from current controls. Read the source selections again.');
    if(!state.pending.some(item=>item.id===request.id)){
      const next=clone(state);next.pending.push({id:request.id,request:clone(request)});state=capacity(next);
    }
    remember();renderHistory();await submit(request);
  }));
  retry.addEventListener('click',()=>act(async()=>{
    const item=state.pending.find(x=>x.id===pending.value);
    if(!item)throw new Error('Choose the original retained request.');
    capture();remember();await submit(clone(item.request));
  }));
  draftHistory.addEventListener('change',controls);pending.addEventListener('change',controls);saved.addEventListener('change',controls);
  restore.addEventListener('click',()=>act(async()=>{
    const item=state.history[Number(draftHistory.value)];if(!item)throw new Error('Choose a complete earlier draft.');
    const restored=clone(item.draft),next=archivedState('Before restoring a retained draft');next.draft=restored;state=capacity(next);generation++;installDraft();
    message('Earlier complete draft restored. The displaced draft remains in its history.');
  }));
  openSaved.addEventListener('click',()=>act(()=>readComparison(saved.value)));
  downloadWorking.addEventListener('click',()=>{
    try{capture();remember();const content=JSON.stringify(state)+'\n';
      const blob=new Blob([content],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');
      a.href=url;a.download='dataset-comparison-working-'+workspaceId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      message('Complete working file downloaded with all draft editions and original requests.');
    }catch(error){message(error.message,true);}
  });
  openWorking.addEventListener('click',()=>{files.value='';files.click();});
  files.addEventListener('change',async()=>{
    const reading=++fileGeneration,file=files.files?.[0];if(!file)return;const start=generation;
    pendingImport=null;incoming.hidden=true;
    try{
      if(file.size>MAX_WORKING)throw new Error('Open a complete working file up to 8 MiB.');
      const selected=workingFile(JSON.parse(await file.text()),workspaceId);
      if(disposed||reading!==fileGeneration)return;
      if(start!==generation)throw new Error('Your draft changed while this file was loading. Choose the file again.');
      pendingImport=selected;incoming.hidden=false;incomingText.textContent='Ready to open '+(selected.draft.title||'Untitled comparison')+
        ' with '+selected.history.length+' earlier draft editions and '+selected.pending.length+' original requests. Current work remains until you open it.';
    }catch(error){if(disposed||reading!==fileGeneration)return;pendingImport=null;incoming.hidden=true;message(error.message,true);}
  });
  applyIncoming.addEventListener('click',()=>act(async()=>{
    if(!pendingImport)throw new Error('Choose a complete working file.');
    const previous=archivedState('Before opening another complete working file'),incomingState=workingFile(pendingImport,workspaceId);
    const seen=new Set(incomingState.pending.map(x=>x.id));
    for(const item of previous.pending){
      const prior=incomingState.pending.find(x=>x.id===item.id);
      if(prior&&JSON.stringify(prior.request)!==JSON.stringify(item.request))throw new Error('Two files give different bodies for the same original request. Keep both working files and recover the exact saved request.');
      if(!seen.has(item.id)){incomingState.pending.push(item);seen.add(item.id);}
    }
    incomingState.history=[...previous.history,...incomingState.history];
    if(fileSize(incomingState)>MAX_ARCHIVED_WORKING)throw new Error('Combined complete working history exceeds 8 MiB. Download both source working files before starting a separate draft.');
    state=capacity(incomingState);generation++;fileGeneration++;pendingImport=null;incoming.hidden=true;installDraft();
    message('Complete working file opened; previous draft editions and requests remain retained.');
  }));
  recover.addEventListener('click',()=>act(async()=>{
    if(!recovery)throw new Error('No earlier browser recovery is available.');
    pendingImport=clone(recovery);incoming.hidden=false;incomingText.textContent='Earlier browser recovery is ready. Open it to retain its full draft history and original requests alongside current work.';
  }));
  const unloading=()=>{capture();remember();};
  window.addEventListener('beforeunload',unloading);
  const ready=(async()=>{
    try{await refreshComparisons();await refreshResults();installDraft();
      if(recovery)message('Earlier complete browser draft reopened with its full history and original requests.');
      else message('Choose two complete retained results, then read their original selections.');
    }catch(error){message(error.message,true);controls();}
  })();
  return {ready,dispose(){disposed=true;viewGeneration++;clearTimeout(pollTimer);window.removeEventListener('beforeunload',unloading);unloading();},
    getWorkingFile(){capture();return state?clone(state):null;}};
}
