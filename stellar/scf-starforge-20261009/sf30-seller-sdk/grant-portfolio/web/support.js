import { createSupportHasher } from './support-hash.js';
// MIT. Original-workspace support console. No independent business-state store.
const $ = id => document.getElementById(id);
const make = (tag, text, attrs = {}) => {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  for (const [key,value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'checked') node.checked = Boolean(value);
    else if (value !== undefined && value !== null) node.setAttribute(key,String(value));
  }
  return node;
};
const M = {token:location.hash.slice(1),state:null,workspace:null,contractId:'',selected:null,
  offset:0,limit:30,search:'',filter:'',pending:null,editor:null,historyOffset:0,busy:false,recovering:false,readSequence:0,issueSequence:0};
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const isoNow = () => new Date().toISOString();
const time = value => value ? value.replace('T',' ').replace('Z',' UTC') : 'Not recorded';
const words = value => String(value ?? '').replaceAll('-',' ');
const option = (value,label) => make('option',label,{value});
const choose = () => M.state?.contracts.find(value => value.id === M.contractId) ?? null;
const actor = () => { const value = $('operator').value.trim(); if (!value) throw Error('Enter the operator name above the report list.'); return value; };
const storageKey = () => 'portfolio-support-pending:' + M.state.workspaceId;
const notice = (value,error = false) => { $('notice').textContent = value; $('notice').classList.toggle('error',error); };
const safeStore = (key,value) => { try { value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key,JSON.stringify(value)); return true; } catch { return false; } };
const safeRead = key => { try { return JSON.parse(sessionStorage.getItem(key) ?? 'null'); } catch { return null; } };
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function http(path,{body,file,timeout = 30000} = {}) {
  const response = await fetch(path,{method:body === undefined && file === undefined ? 'GET' : 'POST',redirect:'error',
    signal:AbortSignal.timeout(timeout),headers:{authorization:'Bearer ' + M.token,
      ...(file ? {'content-type':'application/zip'} : body === undefined ? {} : {'content-type':'application/json'})},
    ...(file ? {body:file} : body === undefined ? {} : {body:JSON.stringify(body)})});
  let value;
  try { value = await response.json(); } catch { throw Error('The workspace response was interrupted. Check the saved operation before continuing.'); }
  if (!response.ok) throw Object.assign(Error(value.message ?? 'The workspace could not complete this request.'),
    {status:response.status,code:value.code,details:value});
  return value;
}
function ordered(value) {
  if(Array.isArray(value))return value.map(ordered);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])]));
  return value;
}
const sameInput=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
function pendingContext() {
  if(!M.pending || !M.state || M.pending.workspaceId!==M.state.workspaceId)throw Error('Open the original workspace and its saved operation.');
  return {workspaceId:M.state.workspaceId,token:M.token,input:structuredClone(M.pending.input)};
}
function pendingMatches(context) {
  return M.token===context.token && M.state?.workspaceId===context.workspaceId
    && M.pending?.workspaceId===context.workspaceId && sameInput(M.pending.input,context.input);
}
function checkedRequest(request,context) {
  if(!request || request.id!==context.input.operationId || request.action!==context.input.action
      || !sameInput(request.input,context.input) || !['RUNNING','COMPLETED','FAILED'].includes(request.state))
    throw Error('The returned request differs from the complete saved original operation.');
  return request;
}
function savedPending(value,context) {
  if(context && !pendingMatches(context))return false;
  if(!M.state)throw Error('Open the original workspace before retaining an operation.');
  if(value && value.workspaceId!==M.state.workspaceId)throw Error('The saved operation belongs to another workspace.');
  if(!safeStore(storageKey(),value))throw Error('The browser could not retain the original operation. Keep this page open and resolve browser storage before continuing.');
  M.pending=value;renderPending();return true;
}
function renderPending() {
  const root=$('pending');root.replaceChildren();root.hidden=!M.pending;
  if(!M.pending)return;
  const p=M.pending;
  root.append(make('h2',p.lastState==='FAILED'?'Saved operation needs attention':'Operation in progress'),
    make('p',words(p.input.action.replace('support.',''))+' · '+p.input.operationId),
    make('p',p.lastError||'The original operation is retained. Check its result or resume that same operation.'));
  const buttons=make('div',null,{class:'buttons'});
  const actions=[['Check result',()=>recover(false)],['Resume original',()=>recover(true)]];
  if(['FAILED','NOT_ADMITTED'].includes(p.lastState))actions.push(['Close reviewed operation',()=>dismissPending()]);
  for(const [label,fn] of actions) {
    const button=make('button',label,{type:'button'});button.disabled=M.busy||M.recovering;
    button.addEventListener('click',()=>fn().catch(error=>notice(error.message,true)));buttons.append(button);
  }
  root.append(buttons);
}
async function withRecovery(action) {
  if(M.busy||M.recovering)return;
  M.recovering=true;renderPending();
  try{return await action(pendingContext());}
  finally{M.recovering=false;renderPending();}
}
async function dismissPending() {
  return withRecovery(async context=>{
    let actual;
    try { actual=checkedRequest(await http('/api/request?id='+encodeURIComponent(context.input.operationId)),context); }
    catch(error) {
      if(!pendingMatches(context))return;
      if(M.pending.lastState!=='NOT_ADMITTED'||error.status!==404)throw error;
      if(savedPending(null,context))notice('The rejected request was not admitted. Review the form and submit the corrected action.');
      return;
    }
    if(!pendingMatches(context))return;
    if(actual.state!=='FAILED')return finishRequest(actual,context);
    if(savedPending(null,context))notice('The failed operation remains in workspace history. Review the form and submit a corrected action.');
  });
}
async function finishRequest(request,context) {
  checkedRequest(request,context);
  const started=Date.now();
  while(request.state==='RUNNING'&&Date.now()-started<240000) {
    if(!pendingMatches(context))return;
    savedPending({...M.pending,lastState:request.state},context);
    await sleep(750);
    if(!pendingMatches(context))return;
    request=checkedRequest(await http('/api/request?id='+encodeURIComponent(context.input.operationId)),context);
  }
  if(!pendingMatches(context))return;
  if(request.state==='COMPLETED') {
    const result=request.result;
    if(!savedPending(null,context))return;
    $('editor').close();
    if(result?.kind==='issue')M.selected=result.id;
    if(result?.kind==='contract')M.contractId=result.id;
    if(result?.contract?.id&&result.editableSupport)M.contractId=result.contract.id;
    await refresh();
    if(M.token!==context.token||M.state?.workspaceId!==context.workspaceId)return result;
    if(result?.object&&result?.schema?.includes('.complete-packet.'))showDelivery(result);
    notice('Saved. The workspace now contains the completed operation.');return result;
  }
  const message=typeof request.error==='string'?request.error:request.error?.message??
    (request.state==='RUNNING'?'The original operation is still running.':'Review the retained operation result.');
  savedPending({...M.pending,lastState:request.state,lastError:message},context);throw Error(message);
}
async function recover(resume) {
  return withRecovery(async context=>{
    let request;
    try { request=await http('/api/request?id='+encodeURIComponent(context.input.operationId)); }
    catch(error) {
      if(!pendingMatches(context))return;
      if(error.status!==404||!resume)throw error;
      request=await http('/api/action',{body:context.input,timeout:90000});
    }
    checkedRequest(request,context);
    if(!pendingMatches(context))return;
    if(resume&&request.state==='FAILED')request=await http('/api/resume',{body:{operationId:context.input.operationId},timeout:90000});
    return finishRequest(request,context);
  });
}
async function runAction(action,payload) {
  if(M.pending||M.recovering)throw Error('Finish or review the saved operation before starting another action.');
  const input={operationId:'support-ui-'+crypto.randomUUID(),action,
    payload:{actor:actor(),...payload},expectedRevision:M.state.revision};
  savedPending({workspaceId:M.state.workspaceId,input,createdAt:isoNow(),lastState:'RUNNING'});
  const context=pendingContext();
  try { return await finishRequest(await http('/api/action',{body:input,timeout:90000}),context); }
  catch(error) {
    if(pendingMatches(context)) {
      let lastState=M.pending.lastState,lastError=error.message;
      try {
        const actual=checkedRequest(await http('/api/request?id='+encodeURIComponent(input.operationId)),context);
        if(!pendingMatches(context))throw error;
        if(actual.state==='COMPLETED')return finishRequest(actual,context);
        lastState=actual.state;lastError=actual.error?.message??error.message;
      } catch(readError) {
        if(!pendingMatches(context))throw error;
        if(readError.status===404&&error.status>=400&&error.status<500)lastState='NOT_ADMITTED';
        lastError=readError.status===404?
          'The workspace has not received this operation. Resume original submits this exact saved request.':readError.message;
      }
      savedPending({...M.pending,lastState,lastError},context);
    }
    throw error;
  }
}
async function refresh() {
  if (!tokenPattern.test(M.token)) return;
  const sequence = ++M.readSequence, token=M.token;
  const params = new URLSearchParams({offset:String(M.offset),limit:String(M.limit)});
  if (M.contractId) params.set('contractId',M.contractId);
  if (M.search) params.set('search',M.search);
  if (M.filter) params.set('state',M.filter);
  const [state,workspace] = await Promise.all([http('/api/support/state?' + params),http('/api/state')]);
  if (sequence !== M.readSequence || M.token!==token) return;
  if(state.workspaceId!==workspace.workspaceId)throw Error('The board and application returned different workspaces.');
  if (M.state && state.workspaceId !== M.state.workspaceId) throw Error('The workspace connection changed. Open its original connection again.');
  M.state = state; M.workspace = workspace;
  $('application').hidden = false; $('connect').hidden = true;
  $('workspace-link').href = '/#' + M.token;
  if (!M.pending) {
    const retained = safeRead(storageKey());
    if (retained?.workspaceId === state.workspaceId && typeof retained.input?.operationId==='string'
        && typeof retained.input?.action==='string' && retained.input.action.startsWith('support.')
        && retained.input.payload && typeof retained.input.payload==='object') M.pending = retained;
  }
  const selected = $('contract-select'); selected.replaceChildren(option('','All contracts'));
  for (const contract of state.contracts) selected.append(option(contract.id,contract.label));
  selected.value = M.contractId;
  $('new-report').disabled = !choose(); $('export').disabled = !choose();
  renderPending(); renderBoard();
  if (M.selected) await showIssue(M.selected);
}
function renderBoard() {
  $('stats').replaceChildren();
  for (const [key,label] of [['total','Matching reports'],['open','Open'],['critical','Critical / open'],['awaitingAcknowledgement','Awaiting acknowledgement']]) {
    const card = make('div',null,{class:'stat'});
    card.append(make('strong',M.state.summary[key]),make('span',label)); $('stats').append(card);
  }
  const body = $('reports'); body.replaceChildren();
  for (const row of M.state.rows) {
    const tr = make('tr',null,{class:row.id === M.selected ? 'selected' : ''});
    const main = make('td'); const button = make('button',row.title,{class:'report-button',type:'button'});
    button.addEventListener('click',() => { M.selected = row.id; showIssue(row.id).catch(error => notice(error.message,true)); renderBoard(); });
    main.append(button,make('small',row.component || 'Component unassigned'));
    main.append(make('span',row.severity,{class:'badge' + (row.severity === 'critical' ? ' strong' : '')}));
    if (row.cycle > 1) main.append(make('span','Reopened · ' + row.cycle,{class:'badge'}));
    const owner = make('td',row.owner || 'Unassigned'); owner.append(make('small',words(row.state)));
    const due = make('td',time(row.clock.dueAt)); due.append(make('small',words(row.clock.state)));
    if (row.clock.previousContractualDeadlineMissed) due.append(make('span','Earlier deadline missed',{class:'badge strong'}));
    tr.append(main,owner,due); body.append(tr);
  }
  $('empty').hidden = M.state.rows.length !== 0;
  $('page-info').textContent = M.state.total ? (M.offset + 1) + '–' + (M.offset + M.state.rows.length) + ' of ' + M.state.total : '0 reports';
  $('previous').disabled = M.offset === 0;
  $('next').disabled = M.state.nextOffset === null;
  $('clear-selection').hidden = !M.selected;
}
function pairs(parent,values) {
  const dl = make('dl'); for (const [label,value] of values) dl.append(make('dt',label),make('dd',value ?? 'Not recorded'));
  parent.append(dl);
}
function rawDetails(parent,label,value) {
  const details = make('details',null,{class:'raw'});details.append(make('summary',label),make('pre',JSON.stringify(value,null,2)));parent.append(details);
}
async function showIssue(id) {
  const sequence=++M.issueSequence,workspaceId=M.state?.workspaceId,token=M.token;
  const value = await http('/api/support/issue?id=' + encodeURIComponent(id));
  if (M.selected !== id || sequence!==M.issueSequence || M.state?.workspaceId!==workspaceId || M.token!==token) return;
  M.issue = value;
  const contract = M.state.contracts.find(row => row.id === value.contractId);
  if (!contract) throw Error('Refresh to load the selected report’s complete service contract.');
  const root = $('detail'); root.hidden = false; root.replaceChildren();
  const heading = make('div',null,{class:'section-heading'});heading.append(make('h2',value.title));
  root.append(heading,make('span',words(value.state),{class:'badge strong'}),make('span',value.severity,{class:'badge'}),make('p',value.description));
  const cycle = value.cycles.at(-1), clock = cycle.acknowledgementClock;
  pairs(root,[['Service contract',contract.label],['Reporter',value.reporter || 'Not recorded'],['Owner',value.owner || 'Unassigned'],
    ['Component',value.component || 'Unassigned'],['Scope',words(value.classification)],['Received',time(cycle.receivedAt)],
    ['Report cycle',cycle.number],['Acknowledgement due',time(clock.dueAt)],
    ['Clock basis',clock.calendar ? clock.calendar.name + ' · ' + clock.calendar.timeZone + ' · ' + clock.state : 'Calendar not selected'],
    ['Acknowledged',time(cycle.acknowledgement?.at)],['Recorded coverage assessment',words(value.entitlement.state)],
    ['Current final acceptance',time(contract.acceptance?.acceptedAt)],['Current support term end',time(contract.acceptance?.supportEndsAt)]]);
  const buttons = make('div',null,{class:'detail-actions'});
  const actions = value.state === 'closed' ? [['Reopen','reopen'],['Add note','note']] :
    [['Triage','triage'],...(!cycle.acknowledgement ? [['Record acknowledgement','acknowledge']] : []),
      ['Agree plan','plan'],['Record workaround','workaround'],['Link correction','correction'],
      ['Validate release','validate'],['Review clock','clock-review'],['Close report','close'],['Add note','note']];
  for (const [label,action] of actions) {
    const b=make('button',label,{type:'button'}); b.addEventListener('click',() => issueForm(action).catch(error => notice(error.message,true))); buttons.append(b);
  }
  root.append(buttons);
  if (cycle.reproduction) root.append(make('h3','Reproduction'),make('p',cycle.reproduction));
  if (cycle.plan) { root.append(make('h3','Agreed correction plan'),make('p',cycle.plan.agreement));
    pairs(root,[['Agreed',time(cycle.plan.agreedAt)],['Workaround target',time(cycle.plan.workaroundDueAt)],['Correction target',time(cycle.plan.correctionDueAt)]]); }
  for (const workaround of cycle.workarounds) root.append(make('h3','Workaround · ' + time(workaround.at)),make('p',workaround.description));
  if (cycle.correction) { root.append(make('h3','Correction')); pairs(root,[['Status',words(cycle.correction.resolvedStatus)],
    ['Linked',time(cycle.correction.linkedAt)],['Project record',cycle.correction.reference.projectRecordId]]); }
  if (cycle.validation) { root.append(make('h3','Release validation · ' + cycle.validation.outcome),make('p',cycle.validation.verification));
    pairs(root,[['Tested',time(cycle.validation.testedAt)],['Installation',cycle.validation.installation.recordId]]); }
  if (cycle.closure) root.append(make('h3','Closure · ' + words(cycle.closure.outcome)),make('p',cycle.closure.reason));
  for (const note of value.notes) root.append(make('h3','Note · ' + note.actor + ' · ' + time(note.at)),make('p',note.text));
  for (const prior of value.cycles.slice(0,-1)) {
    const section=make('details',null,{class:'raw'});section.append(make('summary','Earlier report cycle ' + prior.number + ' · ' + time(prior.receivedAt)));
    pairs(section,[['Acknowledged',time(prior.acknowledgement?.at)],['Closed',time(prior.closure?.at)],['Outcome',words(prior.closure?.outcome)]]);
    section.append(make('p',prior.closure?.reason ?? prior.reproduction));root.append(section);
  }
  root.append(make('h3','Original case history'));
  const history = make('div',null,{id:'history-items'}); root.append(history);
  const more = make('button','Load history',{type:'button'});root.append(more);M.historyOffset=0;
  more.addEventListener('click',() => historyPage(id,history,more).catch(error => notice(error.message,true)));
  await historyPage(id,history,more);
  rawDetails(root,'Complete record',value);
}
async function historyPage(id,root,button) {
  const page=await http('/api/support/history?' + new URLSearchParams({kind:'issue',id,offset:String(M.historyOffset),limit:'20'}));
  if (M.selected !== id) return;
  for (const event of page.events) {
    const item=make('details',null,{class:'history-item'});
    item.append(make('summary','Revision ' + event.revision + ' · ' + words(event.action.replace('support.issue.',''))),
      make('p',event.actor + ' · ' + time(event.at)));
    const payload=event.input.payload;
    const description=payload.reason ?? payload.agreement ?? payload.message ?? payload.text ?? payload.verification ?? payload.description;
    if (description) item.append(make('p',description));
    for (const source of payload.sourceRefs ?? []) item.append(make('p',source.label + ' · ' + source.verification + (source.uri ? ' · ' + source.uri : '')));
    rawDetails(item,'Original operation',event);root.append(item);
  }
  M.historyOffset=page.nextOffset;button.hidden=page.nextOffset===null;button.textContent='More history ('+(page.total-(page.nextOffset??page.total))+' remaining)';
}

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
function localInput(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = x => String(x).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
}
function stamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw Error('Enter a complete date and time.');
  return date.toISOString();
}
function field(parent,name,label,{type='text',value='',required=true,full=false,help,options,rows=3}={}) {
  const wrap=make('label',null,{class:'field'+(full?' full':'')});
  wrap.append(make('span',label));
  const control=make(type==='textarea'?'textarea':type==='select'?'select':'input',null,
    {name,id:'field-'+name,...(!['textarea','select'].includes(type)?{type}:{}),...(required?{required:''}:{}),
      ...(type==='textarea'?{rows}:{}),...(type==='datetime-local'?{step:'1'}:{})});
  if (options) for (const item of options) control.append(option(Array.isArray(item)?item[0]:item,Array.isArray(item)?item[1]:words(item)));
  if (type==='checkbox') control.checked=Boolean(value);
  else if(type!=='file') control.value=type==='datetime-local'?localInput(value):String(value??'');
  wrap.append(control); if(help)wrap.append(make('small',help));parent.append(wrap);return control;
}
function sources(parent,required=true) {
  const box=make('fieldset');box.append(make('legend','Supporting record'));
  field(box,'sourceLabel','Record or correspondence',{required,full:true,help:'Describe the original report, message, agreement or inspected result.'});
  field(box,'sourceKind','Record type',{type:'select',value:'operator-note',options:['operator-note','email','document','test-result','source-record','meeting']});
  field(box,'sourceVerification','How it was checked',{type:'select',value:'operator-recorded',options:[['operator-recorded','Recorded by this operator'],['source-inspected','Original source inspected'],['supplied-record','Supplied record']]});
  field(box,'sourceUri','Source link',{type:'url',required:false,full:true});
  field(box,'sourceNote','Source detail',{type:'textarea',required:false,full:true,rows:2});
  parent.append(box);
}
function refs(data) {
  if(!String(data.sourceLabel??'').trim()) return [];
  return [{kind:data.sourceKind,label:data.sourceLabel,verification:data.sourceVerification,
    ...(data.sourceUri?{uri:data.sourceUri}:{}),...(data.sourceNote?{note:data.sourceNote}:{})}];
}
function editor(title,intro,build,submit,submitLabel='Save') {
  if(M.pending||M.busy||M.recovering) throw Error('Review the saved operation before opening another action.');
  actor();M.editor=submit;$('editor-title').textContent=title;$('editor-intro').textContent=intro;
  $('editor-error').textContent='';$('fields').replaceChildren();$('submit-editor').textContent=submitLabel;
  build($('fields'));$('editor').showModal();
  $('fields').querySelector('input:not([type=hidden]),select,textarea')?.focus();
}
async function releaseOptions(contractId,mode) {
  let offset=0;const values=[];
  for(;;) {
    const page=await http('/api/support/releases?'+new URLSearchParams({contractId,mode,offset:String(offset),limit:'250'}));
    values.push(...page.rows);
    if(page.nextOffset===null)break;
    if(page.nextOffset<=offset)throw Error('The release selection did not advance.');
    offset=page.nextOffset;
  }
  return values;
}
function releaseField(parent,name,label,rows,{required=false,value}={}) {
  const items=[['',required?'Select completed release':'Not selected']];
  for(const row of rows)items.push([row.recordId,row.label+(row.version?' '+row.version:'')+' · '+words(row.kind)+' · '+time(row.createdAt)]);
  field(parent,name,label,{type:'select',required,full:true,options:items,value:value?.recordId??'',
    help:rows.length?'Only retained releases for this portfolio are shown.':'No matching release is recorded yet. Complete its native delivery or installation in the portfolio workspace.'});
}
function releaseRef(rows,id) {
  if(!id)return null;
  const actual=rows.find(row=>row.recordId===id);if(!actual)throw Error('Select the current retained application release.');
  return {recordId:actual.recordId,recordSha256:actual.recordSha256};
}
async function reportForm() {
  const contract=choose();if(!contract)throw Error('Select the report’s service contract.');
  const releases=await releaseOptions(contract.id,'affected');
  editor('New defect report','Record the original receipt time. Times entered here use '+browserZone+'. A report can be received before technical triage.',root=>{
    field(root,'title','Report title',{full:true});
    field(root,'description','Complete report',{type:'textarea',full:true,rows:5});
    field(root,'receivedAt','Received at',{type:'datetime-local',value:isoNow()});
    field(root,'severity','Reported severity',{type:'select',value:'other',options:[['critical','Critical'],['other','Other']]});
    field(root,'reporter','Reporter',{required:false});
    field(root,'component','Component',{required:false});
    field(root,'reproduction','Reproduction or observed behaviour',{type:'textarea',full:true,required:false});
    releaseField(root,'affectedRelease','Affected application release',releases);
    sources(root,false);
  },data=>runAction('support.issue.open',{id:crypto.randomUUID(),contractId:contract.id,expectedContractRevision:contract.revision,
    title:data.title,description:data.description,receivedAt:stamp(data.receivedAt),severity:data.severity,
    reporter:data.reporter,component:data.component,reproduction:data.reproduction,
    affectedRelease:releaseRef(releases,data.affectedRelease),sourceRefs:refs(data)}),'Receive report');
}
async function issueForm(action) {
  const current=M.issue;if(!current||current.id!==M.selected)throw Error('Open the current report.');
  const contract=M.state.contracts.find(row=>row.id===current.contractId),cycle=current.cycles.at(-1);
  const common={id:current.id,expectedIssueRevision:current.revision};
  const commit=payload=>runAction('support.issue.'+action,{...common,...payload});
  const dates='Times entered here use '+browserZone+'.';
  if(action==='triage') {
    const releases=await releaseOptions(contract.id,'affected');
    editor('Triage report','Classify the reported behaviour and assign its engineering owner. '+dates,root=>{
      field(root,'severity','Severity',{type:'select',value:current.severity,options:[['critical','Critical'],['other','Other']]});
      field(root,'classification','Scope classification',{type:'select',value:current.classification,options:
        ['investigating','delivered-defect','new-functionality','material-enhancement','new-integration','changed-requirement','third-party-change','not-reproduced']});
      field(root,'component','Component',{value:current.component});
      field(root,'owner','Engineering owner',{value:current.owner||contract.componentOwners[current.component]||''});
      field(root,'reason','Triage rationale',{type:'textarea',full:true});
      field(root,'reproduction','Reproduction',{type:'textarea',full:true,required:false,value:cycle.reproduction});
      releaseField(root,'affectedRelease','Affected application release',releases,{value:current.affectedRelease});
      sources(root);
    },data=>commit({severity:data.severity,classification:data.classification,component:data.component,owner:data.owner,
      reason:data.reason,reproduction:data.reproduction,affectedRelease:releaseRef(releases,data.affectedRelease),sourceRefs:refs(data)}));
  } else if(action==='acknowledge') {
    editor('Record acknowledgement','Record the acknowledgement already given to the reporter. '+dates,root=>{
      field(root,'at','Acknowledged at',{type:'datetime-local',value:isoNow()});
      field(root,'channel','Channel',{type:'select',value:'email',options:['email','portal','phone','meeting','other']});
      field(root,'message','Actual acknowledgement',{type:'textarea',full:true,rows:5});sources(root);
    },data=>commit({at:stamp(data.at),channel:data.channel,message:data.message,sourceRefs:refs(data)}),'Record acknowledgement');
  } else if(action==='plan') {
    editor('Agreed correction plan','Record the actual workaround or correction targets agreed with the customer for this report. '+dates,root=>{
      field(root,'agreedAt','Agreed at',{type:'datetime-local',value:isoNow()});
      field(root,'workaroundDueAt','Workaround target',{type:'datetime-local',required:false,value:cycle.plan?.workaroundDueAt});
      field(root,'correctionDueAt','Correction target',{type:'datetime-local',required:false,value:cycle.plan?.correctionDueAt});
      field(root,'agreement','Agreed plan',{type:'textarea',full:true,rows:5,value:cycle.plan?.agreement??''});sources(root);
    },data=>commit({agreedAt:stamp(data.agreedAt),workaroundDueAt:stamp(data.workaroundDueAt),correctionDueAt:stamp(data.correctionDueAt),agreement:data.agreement,sourceRefs:refs(data)}));
  } else if(action==='workaround') {
    editor('Record workaround','Record the workaround supplied and its supporting result. '+dates,root=>{
      field(root,'at','Supplied at',{type:'datetime-local',value:isoNow(),full:true});
      field(root,'description','Workaround',{type:'textarea',full:true,rows:5});sources(root);
    },data=>commit({at:stamp(data.at),description:data.description,sourceRefs:refs(data)}));
  } else if(action==='correction') {
    const options=[];let offset=0;
    for(;;) {
      const page=await http('/api/support/corrections?'+new URLSearchParams({contractId:contract.id,offset:String(offset),limit:'100'}));
      options.push(...page.rows);if(page.nextOffset===null)break;offset=page.nextOffset;
    }
    editor('Link staff correction','Select the original correction from the received staff application history. Select its corrected resolution when that engineering work has completed.',root=>{
      field(root,'correction','Original staff correction',{type:'select',full:true,
        options:[['','Select a saved correction'],...options.map((row,index)=>[String(index),row.title+' · '+words(row.status)+
          (row.projectLabel?' · '+row.projectLabel:'')+(row.recordedAt?' · '+time(row.recordedAt):'')])],
        help:options.length?'Each selection refers to its retained project history.':'Receive the staff application’s current correction history to populate this list.'});
      sources(root,false);
    },data=>{
      if(data.correction==='')throw Error('Select the actual saved staff correction.');
      const selected=options[Number(data.correction)];if(!selected)throw Error('The selected correction is no longer in this page.');
      return commit({correction:selected.reference,sourceRefs:refs(data)});
    },'Link original correction');
  } else if(action==='validate') {
    const releases=await releaseOptions(contract.id,'installation');
    editor('Validate corrected release','Record the test performed against the completed target installation. The linked staff correction must contain its corrected resolution. '+dates,root=>{
      releaseField(root,'installation','Completed target installation',releases,{required:true});
      field(root,'testedAt','Tested at',{type:'datetime-local',value:isoNow()});
      field(root,'outcome','Validation result',{type:'select',options:[['passed','Passed'],['failed','Failed']],value:'passed'});
      field(root,'verification','Reproduction and validation result',{type:'textarea',full:true,rows:5});sources(root);
    },data=>commit({installation:releaseRef(releases,data.installation),testedAt:stamp(data.testedAt),outcome:data.outcome,
      verification:data.verification,sourceRefs:refs(data)}),'Record validation');
  } else if(action==='close') {
    editor('Close report','Record the reviewed outcome and supporting correspondence. Corrected closure requires the completed release validation. '+dates,root=>{
      field(root,'at','Closed at',{type:'datetime-local',value:isoNow()});
      field(root,'outcome','Closure outcome',{type:'select',value:cycle.validation?.outcome==='passed'?'corrected':'reviewed-no-change',
        options:['corrected','reviewed-no-change','separately-scoped','duplicate']});
      field(root,'duplicateOf','Original duplicate report ID',{required:false,full:true,help:'Complete this only when the outcome is duplicate.'});
      field(root,'reason','Closure rationale',{type:'textarea',full:true,rows:5});sources(root);
    },data=>commit({at:stamp(data.at),outcome:data.outcome,reason:data.reason,sourceRefs:refs(data),
      ...(data.outcome==='duplicate'?{duplicateOf:data.duplicateOf}:{})}),'Close report');
  } else if(action==='reopen') {
    editor('Reopen report','Start the next report cycle on this same case. All earlier acknowledgements, corrections and closure history remain available. '+dates,root=>{
      field(root,'receivedAt','New report received at',{type:'datetime-local',value:isoNow()});
      field(root,'severity','Reported severity',{type:'select',value:current.severity,options:['critical','other']});
      field(root,'reason','Reason for reopening',{type:'textarea',full:true});
      field(root,'reproduction','New reproduction or observed behaviour',{type:'textarea',required:false,full:true});sources(root);
    },data=>commit({receivedAt:stamp(data.receivedAt),severity:data.severity,reason:data.reason,reproduction:data.reproduction,sourceRefs:refs(data)}),'Reopen report');
  } else if(action==='clock-review') {
    editor('Review acknowledgement clock','Apply the current agreed service calendar to this report’s original receipt time. The prior calculation remains in its history.',root=>{
      root.append(make('p',contract.calendar?contract.calendar.name+' · '+contract.calendar.timeZone+' · '+contract.calendar.state:'Select the service calendar in Terms first.',{class:'help'}));
      field(root,'reason','Reason for reviewing the clock',{type:'textarea',full:true});sources(root);
    },data=>commit({expectedContractRevision:contract.revision,reason:data.reason,sourceRefs:refs(data)}),'Record clock review');
  } else if(action==='note') {
    editor('Add support note','Add the engineering update to this original case.',root=>{
      field(root,'text','Support note',{type:'textarea',full:true,rows:6});sources(root,false);
    },data=>commit({text:data.text,sourceRefs:refs(data)}),'Add note');
  }
}

function parseOwners(text) {
  const values={};
  for(const line of text.split('\n').map(value=>value.trim()).filter(Boolean)) {
    const index=line.indexOf('=');
    if(index<1||!line.slice(index+1).trim())throw Error('Use one Component = Owner assignment per line.');
    const key=line.slice(0,index).trim();if(Object.hasOwn(values,key))throw Error('A component has more than one owner assignment.');
    values[key]=line.slice(index+1).trim();
  }
  return values;
}
function contractForm(current=choose()) {
  const choices=M.workspace.portfolios.map(value=>({id:value.id,revision:value.revision,snapshot:value.snapshot,label:value.name}));
  if(current&&!choices.some(value=>value.id===current.portfolio.id&&value.revision===current.portfolio.revision))
    choices.unshift({...current.portfolio,label:current.label+' · saved portfolio'});
  if(!choices.length)throw Error('Receive or create the portfolio before creating its service contract.');
  const selectedKey=current?current.portfolio.id+':'+current.portfolio.revision:choices[0].id+':'+choices[0].revision;
  editor(current?'Service terms':'New service contract','The support term lasts twelve months from recorded final acceptance. Select the calendar actually agreed for this service; proposed calendars display planning dates.',root=>{
    if(current) {
      const tools=make('div',null,{class:'help'});
      const acceptance=make('button',current.acceptance?'Review recorded acceptance':'Record final acceptance',{type:'button'});
      acceptance.addEventListener('click',()=>{ $('editor').close(); acceptanceForm(current); });
      const fresh=make('button','Create another contract',{type:'button'});
      fresh.addEventListener('click',()=>{ $('editor').close(); contractForm(null); });
      tools.append(acceptance,fresh);root.append(tools);
      if(current.acceptance)root.append(make('p','Accepted '+time(current.acceptance.acceptedAt)+' · support through '+time(current.acceptance.supportEndsAt),{class:'help'}));
    }
    field(root,'label','Service contract name',{value:current?.label??'',full:true});
    field(root,'portfolio','Reviewed portfolio',{type:'select',value:selectedKey,full:true,
      options:choices.filter(value=>!current||value.id===current.portfolio.id).map(value=>[value.id+':'+value.revision,value.label+' · revision '+value.revision])});
    field(root,'serviceOwner','Service coordinator',{value:current?.serviceOwner??''});
    field(root,'plannedAcceptanceOn','Planned final acceptance',{type:'date',value:current?.plannedAcceptanceOn??'2027-01-10'});
    field(root,'componentOwners','Component owners',{type:'textarea',required:false,full:true,
      value:Object.entries(current?.componentOwners??{}).map(([component,owner])=>component+' = '+owner).join('\n'),
      help:'One Component = Owner assignment per line.'});
    const calendar=make('fieldset');calendar.append(make('legend','Service calendar'));
    field(calendar,'calendarState','Calendar status',{type:'select',value:current?.calendar?.state??'not-selected',
      options:[['not-selected','Not selected'],['proposed','Proposed / planning'],['agreed','Agreed service calendar']]});
    field(calendar,'calendarName','Calendar name',{required:false,value:current?.calendar?.name??''});
    field(calendar,'timeZone','Service timezone',{required:false,value:current?.calendar?.timeZone??'',
      help:'IANA timezone, such as Pacific/Noumea. Use the service agreement.'});
    field(calendar,'weekdays','Working weekdays',{required:false,value:(current?.calendar?.weekdays??[0,1,2,3,4]).join(','),
      help:'Monday 0 through Sunday 6, separated by commas.'});
    field(calendar,'opens','Opens',{type:'time',required:false,value:current?.calendar?.opens??'09:00'});
    field(calendar,'closes','Closes',{type:'time',required:false,value:current?.calendar?.closes??'17:00'});
    field(calendar,'counting','Business-day calculation',{type:'select',full:true,value:current?.calendar?.counting??'working-time',
      options:[['working-time','Accumulate the stated service hours'],['next-business-day-close','Close of the next counted business day']]});
    field(calendar,'holidays','Non-working dates',{type:'textarea',required:false,full:true,rows:2,
      value:(current?.calendar?.holidays??[]).join('\n'),help:'One YYYY-MM-DD date per line.'});
    field(calendar,'calendarAgreedAt','Calendar agreed at',{type:'datetime-local',required:false,value:current?.calendar?.agreedAt,
      help:'Required for an agreed calendar. Enter time in '+browserZone+'.'});
    root.append(calendar);sources(root);
  },data=>{
    const p=choices.find(value=>value.id+':'+value.revision===data.portfolio);
    if(!p)throw Error('Select the actual reviewed portfolio.');
    const sourceRefs=refs(data);
    const calendar=data.calendarState==='not-selected'?null:{
      name:data.calendarName,timeZone:data.timeZone,weekdays:[...new Set(data.weekdays.split(',').map(value=>Number(value.trim())))].sort((a,b)=>a-b),
      holidays:[...new Set(data.holidays.split('\n').map(value=>value.trim()).filter(Boolean))].sort(),
      opens:data.opens,closes:data.closes,counting:data.counting,state:data.calendarState,sourceRefs,
      ...(data.calendarState==='agreed'?{agreedAt:stamp(data.calendarAgreedAt)}:{})};
    return runAction('support.contract.save',{id:current?.id??crypto.randomUUID(),expectedContractRevision:current?.revision??0,
      portfolio:{id:p.id,revision:p.revision,snapshot:p.snapshot},label:data.label,serviceOwner:data.serviceOwner,
      componentOwners:parseOwners(data.componentOwners),calendar,plannedAcceptanceOn:data.plannedAcceptanceOn,sourceRefs});
  },current?'Save service terms':'Create service contract');
}
function acceptanceForm(contract) {
  editor('Final acceptance',contract.acceptance?'Record a sourced amendment to the original acceptance. Every earlier revision remains available.':'Record the customer’s actual final acceptance. A deployment or test result alone does not start the support term.',root=>{
    field(root,'acceptedAt','Actual final acceptance',{type:'datetime-local',value:contract.acceptance?.acceptedAt??isoNow(),
      help:'Entered in '+browserZone+'.'});
    field(root,'supportEndsAt','Explicit support end, if agreed',{type:'datetime-local',required:false,value:contract.acceptance?.supportEndsAt,
      help:'Leave blank to calculate twelve calendar months. An explicit end must include that complete term.'});
    if(contract.acceptance)field(root,'amendmentReason','Reason for the acceptance amendment',{type:'textarea',full:true});
    sources(root);
  },data=>runAction('support.contract.acceptance',{id:contract.id,expectedContractRevision:contract.revision,
    acceptedAt:stamp(data.acceptedAt),sourceRefs:refs(data),
    ...(data.supportEndsAt?{supportEndsAt:stamp(data.supportEndsAt)}:{}),
    ...(contract.acceptance?{amendmentReason:data.amendmentReason}:{})}),'Record acceptance');
}
async function handoverForm() {
  const contract=choose();if(!contract)throw Error('Select the service contract to hand over.');
  const releases=await releaseOptions(contract.id,'delivery');
  editor('Prepare complete handover','Include the managed and unmanaged application, support terms, every report cycle, original actions and editable source in one complete handover.',root=>{
    releaseField(root,'delivery','Complete native application delivery',releases,{required:true});
    root.append(make('p','The selected application must belong to this exact reviewed portfolio revision.',{class:'help'}));
  },data=>runAction('support.delivery.prepare',{contractId:contract.id,expectedContractRevision:contract.revision,
    delivery:releaseRef(releases,data.delivery)}),'Prepare complete handover');
}
function receiveForm() {
  editor('Receive complete handover','Continue an existing application and its support cases in this portfolio workspace. The complete archive is checked before its original records are adopted.',root=>{
    const input=field(root,'archive','Complete support handover ZIP',{type:'file',full:true});input.accept='.zip,application/zip';
  },async()=> {
    const file=$('field-archive').files[0];if(!file)throw Error('Select the complete support handover ZIP.');
    if(file.size<1||file.size>4*1024**3)throw Error('Select a complete handover of up to 4 GiB.');
    const hasher=createSupportHasher();let bytes=0;
    for await(const block of file.stream()){hasher.update(block);bytes+=block.byteLength;}
    if(bytes!==file.size)throw Error('The selected handover was interrupted while reading.');
    const expected=hasher.hex();
    const uploaded=await http('/api/upload',{file,timeout:900000});
    if(uploaded.bytes!==file.size||uploaded.sha256!==expected)throw Error('The complete received handover differs from the selected file.');
    return runAction('support.delivery.receive',{object:uploaded.sha256});
  },'Receive and continue');
}
function showDelivery(value) {
  const root=$('delivery-result');root.hidden=false;root.replaceChildren();
  root.append(make('h2',value.editableSupport?'Complete handover received':'Complete handover ready'));
  root.append(make('p',value.editableSupport?'The original application and support history are available for continued work.':'Download the complete editable application and support history.'));
  const row=make('div',null,{class:'download-row'});
  const download=make('button','Download complete ZIP',{type:'button',class:'primary'});
  download.addEventListener('click',()=>downloadDelivery(value).catch(error=>notice(error.message,true)));
  row.append(download,make('span',new Intl.NumberFormat().format(value.bytes)+' bytes'));root.append(row);
  root.append(make('p','SHA-256 '+value.object,{class:'mono'}));
  rawDetails(root,'Handover details',value);
}
async function downloadDelivery(value) {
  let destination,writer;
  const canStream=typeof window.showSaveFilePicker==='function';
  if(canStream) {
    destination=await window.showSaveFilePicker({suggestedName:value.filename,
      types:[{description:'Complete support handover',accept:{'application/zip':['.zip']}}]});
    writer=await destination.createWritable();
  } else if(value.bytes>256*1024*1024) {
    throw Error('This browser cannot save a file of this size directly. Use a browser with direct file saving, or download this original object with the workspace client.');
  }
  let response;
  try {
    response=await fetch('/api/support/delivery?'+new URLSearchParams({object:value.object}),
      {redirect:'error',headers:{authorization:'Bearer '+M.token}});
    if(!response.ok)throw Error('The complete handover could not be opened.');
    const bytes=Number(response.headers.get('content-length')),hash=response.headers.get('x-content-sha256');
    if(bytes!==value.bytes||hash!==value.object||response.headers.get('etag')!=='"'+hash+'"')throw Error('The original handover descriptor changed.');
    const hasher=createSupportHasher(),parts=[];let received=0;
    for await(const part of response.body) {
      received+=part.byteLength;if(received>bytes)throw Error('The handover exceeded its original length.');
      hasher.update(part);if(writer)await writer.write(part);else parts.push(part);
    }
    if(received!==bytes||hasher.hex()!==hash)throw Error('The complete handover bytes differ from the original.');
    if(writer){await writer.close();writer=null;}
    else {
      const url=URL.createObjectURL(new Blob(parts,{type:'application/zip'}));
      const link=make('a',null,{href:url,download:value.filename});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    notice('The complete handover was downloaded and checked.');
  } catch(error) {if(writer)await writer.abort().catch(()=>{});throw error;}
  finally {await response?.body?.cancel().catch(()=>{});}
}
$('connect-form').addEventListener('submit',event=>{
  event.preventDefault();
  try {
    const url=new URL($('connection').value);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!tokenPattern.test(url.hash.slice(1))||url.username||url.password||url.search)
      throw Error('Use the original private loopback workspace connection.');
    if((M.pending||M.busy||M.recovering) && (url.origin!==location.origin||url.hash.slice(1)!==M.token))
      throw Error('Finish or review the saved operation before changing its workspace connection.');
    if(url.origin!==location.origin){location.assign(url.origin+'/support/'+url.hash);return;}
    M.token=url.hash.slice(1);history.replaceState(null,'','/support/#'+M.token);$('connection').value='';
    refresh().catch(error=>notice(error.message,true));
  } catch(error) {notice(error.message,true);}
});
$('editor-form').addEventListener('submit',async event=>{
  event.preventDefault();if(M.busy||M.recovering)return;M.busy=true;renderPending();$('submit-editor').disabled=true;$('editor-error').textContent='';
  try {const values=Object.fromEntries(new FormData($('editor-form')).entries());await M.editor(values);}
  catch(error){$('editor-error').textContent=error.message;notice(error.message,true);}
  finally{M.busy=false;renderPending();$('submit-editor').disabled=false;}
});
$('cancel-editor').addEventListener('click',()=>$('editor').close());
$('refresh').addEventListener('click',()=>refresh().catch(error=>notice(error.message,true)));
$('new-report').addEventListener('click',()=>reportForm().catch(error=>notice(error.message,true)));
$('terms').addEventListener('click',()=>{try{contractForm();}catch(error){notice(error.message,true);}});
$('export').addEventListener('click',()=>handoverForm().catch(error=>notice(error.message,true)));
$('receive').addEventListener('click',()=>{try{receiveForm();}catch(error){notice(error.message,true);}});
$('contract-select').addEventListener('change',()=>{
  M.contractId=$('contract-select').value;M.offset=0;M.selected=null;$('detail').hidden=true;refresh().catch(error=>notice(error.message,true));
});
$('filters').addEventListener('submit',event=>{
  event.preventDefault();M.search=$('search').value;M.filter=$('status-filter').value;M.offset=0;refresh().catch(error=>notice(error.message,true));
});
$('previous').addEventListener('click',()=>{M.offset=Math.max(0,M.offset-M.limit);refresh().catch(error=>notice(error.message,true));});
$('next').addEventListener('click',()=>{if(M.state.nextOffset!==null){M.offset=M.state.nextOffset;refresh().catch(error=>notice(error.message,true));}});
$('clear-selection').addEventListener('click',()=>{M.selected=null;M.issue=null;$('detail').hidden=true;renderBoard();});
if(tokenPattern.test(M.token)) refresh().catch(error=>{notice(error.message,true);$('application').hidden=false;});
else {$('connect').hidden=false;}
