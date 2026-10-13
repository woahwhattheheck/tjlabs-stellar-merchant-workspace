// MIT. Customer-use commissioning in the original private Collections workspace.
export function createCustomerUsePanel({host,api,onOpen=async()=>{},onPlans=()=>{},onBusy=()=>{}}) {
  const root='/api/customer-use',schema='stellar-forge.sf88.customer-use-commission.v1';
  const state={connected:false,workspace:null,queueRoot:null,epoch:0,visible:false,blocked:false,busy:false,
    sources:[],commissions:[],plans:[],collections:[],source:null,view:null,draft:null,dirty:false,
    tab:'uses',entry:null,query:'',page:0,periodIndex:0,planCache:new Map(),responseCache:new Map(),
    captureIds:new Set(),maxVerifyBytes:'268435456',actor:'',message:'',error:false,pending:null,rejected:null,attempted:false};
  const workspaces=new Map();
  let shell,content,notice,sequence=0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const refKey=ref=>JSON.stringify([ref.installationId,ref.revision,ref.installationSha256,ref.entryId]);
  const planKey=period=>JSON.stringify([period.planId,period.planSha256]);
  const slug=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,68)||'customer-use';
  const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined&&text!==null)node.textContent=String(text);if(className)node.className=className;return node;};
  const add=(parent,...nodes)=>{parent.append(...nodes.flat().filter(Boolean));return parent;};
  const button=(label,action,kind)=>{const node=el('button',label,kind);node.type='button';node.addEventListener('click',action);return node;};
  const actions=(...nodes)=>add(el('div',null,'customer-use-actions'),...nodes);
  const details=(title,...nodes)=>add(el('details'),el('summary',title),...nodes);
  const json=value=>el('pre',JSON.stringify(value,null,2),'customer-use-json');
  const key=()=> 'starforge.customer-use.pending.'+location.origin+':'+state.workspace;
  function field(label,value,change,{rows,help,readonly=false,type='text'}={}) {
    const wrap=el('div',null,'customer-use-field'),id='customer-use-'+(++sequence);
    const input=el(rows?'textarea':'input');input.id=id;input.value=value??'';input.spellcheck=false;
    if(rows)input.rows=rows;else input.type=type;
    input.readOnly=readonly;
    input.addEventListener('input',()=>change(input.value,input));
    const name=el('label',label);name.htmlFor=id;add(wrap,name,input);
    if(help)add(wrap,el('p',help,'customer-use-help'));return {wrap,input};
  }
  function select(label,options,value,change) {
    const wrap=el('div',null,'customer-use-field'),id='customer-use-'+(++sequence),input=el('select');input.id=id;
    for(const [key,title]of options){const option=el('option',title);option.value=String(key);input.append(option);}
    input.value=String(value??'');input.addEventListener('change',()=>change(input.value));
    const name=el('label',label);name.htmlFor=id;add(wrap,name,input);return wrap;
  }
  function table(headings,rows) {
    const wrap=el('div',null,'customer-use-table'),table=el('table'),header=el('tr');
    for(const title of headings){const cell=el('th',title);cell.scope='col';header.append(cell);}
    add(table,add(el('thead'),header));const body=el('tbody');
    for(const cells of rows){const row=el('tr');for(const value of cells)add(row,add(el('td'),value instanceof Node?value:el('span',value??'—')));body.append(row);}
    if(!rows.length){const cell=el('td','No matching entries.');cell.colSpan=headings.length;body.append(add(el('tr'),cell));}
    add(table,body);return add(wrap,table);
  }
  function say(message,error=false){state.message=message;state.error=error;if(notice){notice.textContent=message;notice.hidden=!message;notice.dataset.kind=error?'error':'status';}}
  function fail(error){say(error.message&&error.message!==error.code?error.message+' ['+(error.code??'request')+']':String(error.code??error.message??error).replaceAll('_',' '),true);}
  function changed(){state.dirty=true;updateStatus();}
  function updateStatus() {
    const node=host.querySelector('[data-use-saved]');
    if(node)node.textContent=state.pending?'Original action retained; reconcile it before another mutation.'
      :state.dirty?'Unsaved commissioning edits':state.view?'Saved revision '+state.view.selected.revision:'New commissioning definition';
  }
  function sync(){if(shell)shell.disabled=!state.connected||state.blocked||state.busy;updateStatus();}
  function alive(epoch){return state.connected&&state.epoch===epoch;}
  async function task(label,fn) {
    if(state.busy||state.blocked||!state.connected)return;
    const epoch=state.epoch;state.busy=true;onBusy(true);sync();say(label);
    try{await fn(epoch);}catch(error){if(alive(epoch))fail(error);}
    finally{if(alive(epoch)){state.busy=false;onBusy(false);sync();}}
  }
  function canLeave(){return !state.pending&&(!state.dirty||confirm('Discard the unsaved commissioning edits? Download the edited definition first if you want to keep them.'));}
  function stashPending(value) {
    // Retain exact identity before dispatch; a failed local write prevents dispatch.
    sessionStorage.setItem(key(),JSON.stringify({workspace:state.workspace,queueRoot:state.queueRoot,...value}));
    state.pending=value;
  }
  function clearPending(){sessionStorage.removeItem(key());state.pending=null;}
  function readPending(){
    const value=sessionStorage.getItem(key());if(!value)return null;
    const parsed=JSON.parse(value);
    if(parsed.workspace!==state.workspace||parsed.queueRoot!==state.queueRoot)throw Error('The saved action belongs to another original workspace.');
    return parsed;
  }
  async function readLibrary(epoch) {
    const [sources,commissions,plans,collections]=await Promise.all([
      api(root+'/sources'),api(root+'/commissions'),api('/api/composer/plans'),api('/api/collections')]);
    if(!alive(epoch))return false;
    state.sources=sources.sources;state.commissions=commissions.commissions;
    state.plans=plans.plans;state.collections=collections.collections??[];
    state.attempted=true;return true;
  }
  async function plan(period,epoch) {
    const key=planKey(period);if(state.planCache.has(key))return state.planCache.get(key);
    const result=await api('/api/composer/plans/'+encodeURIComponent(period.planId)+'/'+period.planSha256);
    if(!alive(epoch))return null;state.planCache.set(key,result);return result;
  }
  function catalogue() {
    if(!state.source)return [];
    return state.source.catalogue??state.source.source.calendars.flatMap(calendar=>calendar.document.entries.map(entry=>{
      const observed=calendar.report.entries.find(row=>row.id===entry.id);
      return {ref:{installationId:calendar.id,revision:calendar.revision,installationSha256:calendar.sha256,entryId:entry.id},
        installation:calendar,entry,task:observed.task,buyer:observed.buyer,
        funding:calendar.document.settlements.filter(row=>entry.fundingIds.includes(row.id))};
    }));
  }
  async function openCommission(id,sha256,epoch,replace=true) {
    const view=await api(root+'/commissions/'+encodeURIComponent(id)+(sha256?'/revisions/'+sha256:''));
    if(!alive(epoch))return;
    state.view=view;
    state.source={metadata:view.calendar.metadata,source:view.calendar.source};
    for(const saved of Object.values(view.plans))state.planCache.set(JSON.stringify([saved.id,saved.planSha256]),saved);
    if(replace){state.captureIds=new Set();state.draft=clone(view.document);state.dirty=false;state.entry=null;state.page=0;}
    render();
  }
  async function openSource(sha256,epoch) {
    const selected=await api(root+'/sources/'+sha256);if(!alive(epoch))return;
    state.source=selected;state.view=null;state.entry=null;state.page=0;
    state.draft={schema,id:slug(selected.source.calendars[0].name)+'-'+Date.now().toString(36),
      name:selected.source.calendars[0].name,calendarSha256:sha256,note:'',periods:[],bindings:[]};
    state.dirty=true;state.tab='uses';render();
  }
  async function dispatch(kind,input,epoch) {
    const selectedId=input.id??input.document?.id;
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(selectedId??''))throw Error('Use a stable commission reference of 1–80 letters, digits, dots, underscores or hyphens, beginning with a letter or digit.');
    if(!state.pending)stashPending({kind,input:clone({...input,requestId:crypto.randomUUID()})});
    const pending=state.pending;
    if(pending.kind!==kind)throw Error('Continue the original retained action before choosing another action.');
    const id=pending.input.id??pending.input.document?.id;
    const url=kind==='SAVE'?root+'/commissions':root+'/commissions/'+encodeURIComponent(id)+'/'+kind.toLowerCase();
    const payload=clone(pending.input);delete payload.id;
    let result;
    try{result=await api(url,payload);}
    catch(error){
      if(alive(epoch)&&[400,404,409,413,422].includes(error.status)&&/^CUSTOMER_USE_/.test(error.code??'')){
        stashPending({...pending,rejection:{code:error.code,status:error.status,message:String(error.message??error.code),
          details:error.details??null,observedAt:new Date().toISOString()},notAdmitted:null});
        try{await inspectPending(epoch);}catch{/* The original request remains pending when admission cannot be established. */}
        if(alive(epoch))render();
      }
      throw error;
    }
    if(!alive(epoch))return null;
    clearPending();return result;
  }
  function actorRequired(){if(!state.actor.trim())throw Error('Enter the operator name before saving or preparing this work.');return state.actor.trim();}
  async function saveDraft() {
    return task('Saving this commission and its original plan selections…',async epoch=>{
      if(!state.draft)return;
      const result=await dispatch('SAVE',{document:clone(state.draft),
        expectedHeadSha256:state.view?.selected?.sha256??null,actor:actorRequired()},epoch);
      if(!result)return;
      await readLibrary(epoch);await openCommission(result.id,result.sha256,epoch);
      say('Commission saved. The original Calendar bytes and earlier revisions are retained.');
    });
  }
  async function periodAction(kind,period) {
    return task(kind==='PREPARE'?'Preparing the original period inputs…':'Creating the reviewed original collection…',async epoch=>{
      if(state.dirty||!state.view)throw Error('Save these commissioning edits before preparing a period.');
      const native=state.view.periods.find(row=>row.selection.collectionId===period.collectionId)?.native;
      const input={id:state.view.selected.id,sha256:state.view.selected.sha256,
        collectionId:period.collectionId,actor:actorRequired()};
      if(kind==='CREATE') {
        if(!native?.editionSha256||!native.preview?.previewSha256)throw Error('Prepare and inspect the original period review first.');
        input.expectedEditionSha256=native.editionSha256;input.expectedPreviewSha256=native.preview.previewSha256;
      }
      const result=await dispatch(kind,input,epoch);if(!result)return;
      await openCommission(input.id,input.sha256,epoch,false);
      say(kind==='CREATE'?'Original collection created. Open its selected requests to use the existing approval and receiving controls.'
        :'Original period retained. Review every included request and the original spending groups before creation.');
    });
  }
  async function inspectPending(epoch) {
    const pending=state.pending;if(!pending)return null;const id=pending.input.id??pending.input.document.id;
    const retained=await api(root+'/commissions/'+encodeURIComponent(id)+'/actions/'+pending.input.requestId);
    if(!alive(epoch)||state.pending?.input.requestId!==pending.input.requestId)return null;
    if(retained.id!==id||retained.requestId!==pending.input.requestId)throw Error('The returned action belongs to another request.');
    if(retained.state==='NOT_ADMITTED'&&retained.request===null&&retained.result===null&&pending.rejection){
      stashPending({...pending,notAdmitted:{checkedAt:retained.checkedAt}});
    }else if(pending.notAdmitted)stashPending({...pending,notAdmitted:null});
    return retained;
  }
  async function reconcile() {
    return task('Inspecting the original action…',async epoch=>{
      const retained=await inspectPending(epoch);if(!retained)return;
      const pending=state.pending,id=pending.input.id??pending.input.document.id;
      if(!retained.result){
        say(pending.notAdmitted?'The original owner confirms this rejected request was not admitted. Return to editing to preserve its input and review the current saved head.'
          :'No completed result was returned. Continue this exact original request; an uncertain result cannot be discarded.');
        render();return;
      }
      clearPending();
      await openCommission(id,retained.result.sha256??retained.result.commission?.sha256,epoch);
      await readLibrary(epoch);render();say('The original returned action is adopted. No new period was created.');
    });
  }
  async function returnToEditing() {
    return task('Preserving the rejected request and reopening the current saved head…',async epoch=>{
      const retained=await inspectPending(epoch),pending=state.pending;
      if(!retained||!pending?.rejection||!pending.notAdmitted)throw Error('Keep the original action until its rejection and non-admission are both confirmed.');
      const id=pending.input.id??pending.input.document.id;
      const draft=clone(pending.kind==='SAVE'?pending.input.document:state.draft);
      let current=null;
      try{current=await api(root+'/commissions/'+encodeURIComponent(id));}
      catch(error){if(error.status!==404||error.code!=='CUSTOMER_USE_COMMISSION_NOT_FOUND')throw error;}
      const source=draft?await api(root+'/sources/'+draft.calendarSha256):null;
      if(!alive(epoch))return;
      // Preserve the exact failed input and response before unlocking any editor.
      const rejection={schema:'stellar-forge.sf88.customer-use-rejected-request.v1',
        workspace:state.workspace,queueRoot:state.queueRoot,action:clone(pending),
        reviewedCurrentHead:current?.currentHead??null,returnedToEditingAt:new Date().toISOString()};
      sessionStorage.setItem(key()+'.rejected.'+pending.input.requestId,JSON.stringify(rejection));
      clearPending();state.view=current;state.source=source;state.draft=draft;state.dirty=Boolean(draft);
      if(current)for(const saved of Object.values(current.plans))state.planCache.set(JSON.stringify([saved.id,saved.planSha256]),saved);
      state.rejected=rejection;render();
      say('Your complete draft and rejected request are preserved. Review the current saved edition before saving; the next save uses a new request ID and this displayed head.');
    });
  }
  async function continuePending() {
    const pending=state.pending;if(!pending)return;
    return task('Continuing the exact original action…',async epoch=>{
      const result=await dispatch(pending.kind,pending.input,epoch);if(!result)return;
      const id=pending.input.id??pending.input.document.id;
      await openCommission(id,result.sha256??result.commission?.sha256,epoch);
      await readLibrary(epoch);render();say('The original action returned and is retained.');
    });
  }
  async function upload(file) {
    if(!file)return;
    return task('Retaining the exact original calendar export…',async epoch=>{
      if(!canLeave())return;if(file.size>32*1024*1024)throw Error('Choose a Calendar export within 32 MiB.');
      const bytes=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      await api(root+'/sources/'+sha,bytes,{raw:true,contentType:'application/octet-stream',
        headers:{'X-Customer-Use-Name':encodeURIComponent(file.name)}});
      if(!alive(epoch))return;await readLibrary(epoch);await openSource(sha,epoch);
      say('Original Calendar export retained. Choose the saved request plans and useful-use bindings.');
    });
  }
  function downloadLocal(value,name) {
    const object=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
    const link=el('a');link.href=object;link.download=name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(object),10000);
  }
  async function exportSaved(format) {
    return task('Preparing the complete saved inspection export…',async epoch=>{
      const saved=state.view?.selected;if(!saved)throw Error('Save or open a commission first.');
      const response=await api(root+'/commissions/'+encodeURIComponent(saved.id)+'/revisions/'+saved.sha256+'/export/'+format,undefined,{stream:true});
      const raw=await response.arrayBuffer(),wanted=response.headers.get('x-content-sha256');
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('');
      if(digest!==wanted)throw Error('The complete export digest differs from its source response.');
      if(!alive(epoch))return;
      const object=URL.createObjectURL(new Blob([raw],{type:response.headers.get('content-type')??'application/octet-stream'}));
      const link=el('a');link.href=object;link.download=saved.id+'-customer-use.'+format;document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(object),10000);say('Saved inspection export downloaded. Complete operating handover uses Backup and receiving.');
    });
  }
  async function captureReturn() {
    return task('Verifying original retained Inbox results…',async epoch=>{
      if(state.dirty||!state.view)throw Error('Save or open the exact commission before capturing buyer results.');
      if(!state.captureIds.size)throw Error('Select the useful tasks whose original results belong in this return.');
      if(!/^(0|[1-9][0-9]*)$/.test(state.maxVerifyBytes))throw Error('Enter a whole per-file verification byte limit.');
      const input={id:state.view.selected.id,sha256:state.view.selected.sha256,
        bindingIds:[...state.captureIds].sort(),maxVerifyBytes:Number(state.maxVerifyBytes),actor:actorRequired()};
      const result=await dispatch('CAPTURE',input,epoch);if(!result)return;
      await openCommission(input.id,input.sha256,epoch,false);
      say('Original buyer evidence retained. Download this return and review its deployment and purchase association in Grant Operations.');
    });
  }
  async function downloadReturn(requestId) {
    return task('Reading the exact retained buyer return…',async epoch=>{
      const saved=state.view.selected;
      const response=await api(root+'/commissions/'+encodeURIComponent(saved.id)+'/returns/'+requestId,undefined,{stream:true});
      const raw=await response.arrayBuffer();
      if(raw.byteLength>16*1024*1024)throw Error('The complete return exceeds its 16 MiB limit.');
      const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('');
      if(actual!==response.headers.get('x-content-sha256'))throw Error('The retained buyer return digest differs.');
      if(!alive(epoch))return;
      const object=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
      const link=el('a');link.href=object;link.download=saved.id+'-'+requestId+'-buyer-return.json';
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(object),10000);
      say('Complete buyer return downloaded. Original response bytes remain in the encrypted Collections handover.');
    });
  }
  function bindingFor(row,create=false) {
    let binding=state.draft.bindings.find(item=>refKey(item.entry)===refKey(row.ref));
    if(!binding&&create){
      binding={id:'use-'+crypto.randomUUID(),entry:clone(row.ref),
        kind:row.entry.mode==='REOPEN'?'RETAINED_RESPONSES':'PERIOD_REQUESTS',requests:[],responses:[],note:''};
      state.draft.bindings.push(binding);
    }
    return binding;
  }
  function trimBinding(binding) {
    if(!binding.requests.length&&!binding.responses.length&&!binding.note.trim())
      state.draft.bindings=state.draft.bindings.filter(row=>row!==binding);
  }
  function sourceDetails() {
    const selected=state.source.source;
    return details('Original case, Installation and source history',json({source:selected.source,
      selection:selected.selection,asOfDate:selected.asOfDate,sha256:state.draft.calendarSha256,
      currentChanges:selected.calendars.map(row=>({id:row.id,revision:row.revision,currentChanges:row.currentChanges,sourceChanged:row.sourceChanged})),
      qualification:selected.qualification}));
  }
  function renderUses() {
    const section=el('section'),list=el('div');
    add(section,el('p','Each row is one saved useful task. Bind requests from reviewed periods, or choose an already retained response for a reopen. Cancelled uses remain visible.','customer-use-help'),
      field('Find a date, buyer, task or use',state.query,value=>{state.query=value;state.page=0;draw();},{type:'search'}).wrap,list);
    function draw() {
      const query=state.query.trim().toLowerCase(),rows=catalogue().filter(row=>
        [row.entry.date,row.entry.mode,row.entry.state,row.entry.id,row.task.name,row.task.purpose,row.buyer.name,row.buyer.id]
          .join(' ').toLowerCase().includes(query));
      const pages=Math.max(1,Math.ceil(rows.length/100));state.page=Math.min(state.page,pages-1);
      list.replaceChildren(table(['Use date','Buyer / useful task','Mode','Binding',''],rows.slice(state.page*100,state.page*100+100).map(row=>{
        const binding=bindingFor(row);
        return [row.entry.date,add(el('div'),el('strong',row.task.name),el('p',row.buyer.name??row.buyer.id,'customer-use-help')),
          row.entry.mode+' · '+row.entry.state,binding?(binding.requests.length+' requests / '+binding.responses.length+' retained results'):'Unbound',
          button('Choose',()=>{state.entry=refKey(row.ref);render();})];
      })));
      const previous=button('Previous',()=>{state.page--;draw();}),next=button('Next',()=>{state.page++;draw();});
      previous.disabled=state.page===0;next.disabled=state.page===pages-1;
      add(list,actions(previous,el('span',(state.page+1)+' / '+pages+' · '+rows.length+' saved uses'),next));
    }
    draw();
    const row=catalogue().find(row=>refKey(row.ref)===state.entry);
    if(row)add(section,renderBinding(row));
    return section;
  }
  function renderBinding(row) {
    const section=el('section',null,'customer-use-box'),binding=bindingFor(row);
    add(section,el('h3',row.task.name+' · '+row.entry.date),
      el('p',(row.buyer.name??row.buyer.id)+' · '+row.entry.mode+' · '+row.entry.state),
      el('p',row.task.purpose),details('Whole request, useful output and original funding',
        json({request:row.task.request,completeOutput:row.task.completeOutput,repeatTrigger:row.task.repeatTrigger,
          pricedUnit:row.task.pricedUnit,sourcePeriod:row.entry.sourcePeriod,funding:row.funding,original:row.ref})));
    if(row.entry.mode==='REOPEN')add(section,renderResponseSelection(row));
    else{
      if(!state.draft.periods.length)add(section,el('p','Add an original saved Request plan period in the Periods view first.'));
      for(const period of state.draft.periods) {
        const saved=state.planCache.get(planKey(period)),box=el('fieldset');add(box,el('legend',period.name));
        if(!saved){
          add(box,button('Read this saved plan',()=>task('Reading the exact original plan…',async epoch=>{await plan(period,epoch);if(alive(epoch))render();})));
        }else for(const request of saved.plan.requests){
          const input=el('input');input.type='checkbox';input.checked=Boolean(binding?.requests.some(ref=>ref.collectionId===period.collectionId&&ref.requestKey===request.key));
          input.addEventListener('change',()=>{
            const current=bindingFor(row,true);current.requests=current.requests.filter(ref=>ref.collectionId!==period.collectionId||ref.requestKey!==request.key);
            if(input.checked)current.requests.push({collectionId:period.collectionId,requestKey:request.key});
            trimBinding(current);changed();
          });
          add(box,add(el('label',null,'customer-use-choice'),input,
            el('span',request.name+' · '+request.key+' · '+request.method+' '+request.url)));
        }
        add(section,box);
      }
    }
    add(section,field('Binding note',binding?.note??'',value=>{const current=bindingFor(row,true);current.note=value;trimBinding(current);changed();},{rows:3}).wrap);
    if(binding)add(section,button('Remove this binding',()=>{state.draft.bindings=state.draft.bindings.filter(item=>item!==binding);changed();render();}));
    return section;
  }
  function renderResponseSelection(row) {
    const section=el('div'),binding=bindingFor(row);
    add(section,el('p','Choose an original collection, then select a response whose native record is SAVED. This retains its original intent, manifest and response digest.','customer-use-help'));
    const chooser=select('Existing collection',[['','Choose a collection'],...state.collections.map(item=>[item.id,item.name??item.id])],'',value=>{
      if(!value)return;void task('Reading retained response identities…',async epoch=>{
        const result=await api('/api/collections/'+encodeURIComponent(value));
        if(!alive(epoch))return;state.responseCache.set(value,result);render();
      });
    });
    add(section,chooser);
    for(const collection of state.responseCache.values()){
      const rows=collection.items.filter(item=>item.job?.outcome?.responseFile?.status==='SAVED');
      if(!rows.length)continue;
      const box=el('fieldset');add(box,el('legend',collection.name??collection.id));
      for(const item of rows){
        const file=item.job.outcome.responseFile,input=el('input');input.type='checkbox';
        input.checked=Boolean(binding?.responses.some(ref=>ref.collectionId===collection.id&&ref.intentId===item.intentId&&ref.responseSha256===file.sha256));
        input.addEventListener('change',()=>{
          const current=bindingFor(row,true);current.responses=current.responses.filter(ref=>ref.collectionId!==collection.id||ref.intentId!==item.intentId);
          if(input.checked)current.responses.push({collectionId:collection.id,manifestSha256:collection.manifestSha256,intentId:item.intentId,responseSha256:file.sha256});
          trimBinding(current);changed();
        });
        add(box,add(el('label',null,'customer-use-choice'),input,el('span',item.intentId+' · '+file.bytes+' bytes · '+file.sha256)));
      }
      add(section,box);
    }
    if(binding?.responses.length)add(section,details('Selected original result references',json(binding.responses)));
    return section;
  }
  function addPeriod() {
    return task('Selecting the original Request plan revision…',async epoch=>{
      const selected=state.plans.find(row=>!row.error);if(!selected){onPlans();return;}
      const period={collectionId:slug(state.draft.id)+'-'+(state.draft.periods.length+1)+'-'+Date.now().toString(36),
        name:'Reporting period '+(state.draft.periods.length+1),planId:selected.id,planSha256:selected.planSha256,values:{}};
      const saved=await plan(period,epoch);if(!saved)return;
      period.values=Object.fromEntries(saved.plan.parameters.map(value=>[value.name,value.default??'']));
      state.draft.periods.push(period);state.periodIndex=state.draft.periods.length-1;changed();render();
    });
  }
  function renderPeriods() {
    const section=el('section');
    add(section,actions(button('Add reviewed-plan period',addPeriod,'primary'),button('Open Request plans',onPlans)),
      el('p','A period prepares the complete original plan. Bind the intended request keys in Uses. Opening its collection selects the active bound requests; the original queue, payment review and signer still govern every execution.','customer-use-help'));
    if(!state.draft.periods.length){add(section,el('p','Choose or author a saved request plan before adding its period.'));return section;}
    state.periodIndex=Math.min(state.periodIndex,state.draft.periods.length-1);
    add(section,select('Period',state.draft.periods.map((row,index)=>[index,row.name]),state.periodIndex,value=>{state.periodIndex=Number(value);render();}));
    const period=state.draft.periods[state.periodIndex],saved=state.planCache.get(planKey(period));
    add(section,field('Period name',period.name,value=>{period.name=value;changed();}).wrap,
      field('Collection reference',period.collectionId,()=>{},{readonly:true,help:'This stable reference resumes the original period. Add another period for different retained request inputs.'}).wrap,
      select('Saved Request plan revision',state.plans.filter(row=>!row.error).map(row=>[JSON.stringify([row.id,row.planSha256]),row.name+' · '+row.planSha256.slice(0,12)]),planKey(period),value=>{
        void task('Reading the selected saved plan…',async epoch=>{
          const [planId,planSha256]=JSON.parse(value),selected={...period,planId,planSha256};
          const next=await plan(selected,epoch);if(!next)return;
          const priorKeys=new Set(next.plan.requests.map(row=>row.key));
          if(state.draft.bindings.some(binding=>binding.requests.some(ref=>ref.collectionId===period.collectionId&&!priorKeys.has(ref.requestKey))))
            throw Error('Remove this period’s bindings to request keys absent from the selected plan before changing its revision.');
          period.planId=planId;period.planSha256=planSha256;
          period.values=Object.fromEntries(next.plan.parameters.map(param=>[param.name,Object.hasOwn(period.values,param.name)?period.values[param.name]:param.default??'']));
          changed();render();
        });
      }));
    if(saved)for(const parameter of saved.plan.parameters)add(section,field(parameter.label??parameter.name,
      period.values[parameter.name]??parameter.default??'',value=>{period.values[parameter.name]=value;changed();},
      {help:'Original parameter: '+parameter.name}).wrap);
    else add(section,button('Read selected plan',()=>task('Reading selected plan…',async epoch=>{await plan(period,epoch);if(alive(epoch))render();})));
    const native=state.view?.periods.find(row=>row.selection.collectionId===period.collectionId);
    if(native?.error)add(section,el('p',native.error.message+' ['+native.error.code+']','customer-use-help'));
    if(native?.native){
      const original=native.native;
      add(section,el('h3','Original period review'),el('p',original.phase+' · '+original.requests.length+' retained requests'),
        table(['Network / flow','Asset','Recipient','Requests','Maximum atomic'],(original.preview?.totals??[]).map(row=>[
          row.network+' / '+row.paymentFlow,row.asset,row.payTo,row.itemCount,row.maxAtomic])),
        details('All original included requests and source identities',json(original.requests)),
        original.issues.length?details('Original source issues',json(original.issues)):null);
      if(original.collection)add(section,button('Open active bound requests',()=>task('Opening original collection…',async epoch=>{
        if(state.dirty)throw Error('Save or discard these edits before opening the selected saved operation.');
        const fresh=await api(root+'/commissions/'+encodeURIComponent(state.view.selected.id)+'/revisions/'+state.view.selected.sha256);
        if(!alive(epoch))return;
        const current=fresh.periods.find(row=>row.selection.collectionId===period.collectionId)?.native;
        if(!current?.collection)throw Error('The original collection is unavailable.');
        const rows=fresh.review.rows.filter(row=>row.entry.state==='PLANNED');
        const keys=new Set(rows.flatMap(row=>row.binding?.requests??[]).filter(row=>row.collectionId===period.collectionId).map(row=>row.requestKey));
        const intents=current.requests.filter(row=>keys.has(row.key)).map(row=>row.intentId);
        await onOpen({edition:current,intentIds:intents});
      })));
    }
    const controls=actions(button('Prepare and review original period',()=>periodAction('PREPARE',period)));
    if(native?.native?.editionSha256&&native.native.preview)add(controls,button('Create reviewed collection',()=>periodAction('CREATE',period),'primary'));
    add(section,controls,button('Remove period from this edited revision',()=>{
      if(state.draft.bindings.some(row=>row.requests.some(ref=>ref.collectionId===period.collectionId))){say('Remove the dated-use bindings to this period before removing it.',true);return;}
      state.draft.periods=state.draft.periods.filter(row=>row!==period);changed();render();
    }));
    if(state.dirty)add(section,el('p','Save this definition before preparing or creating its original periods.','customer-use-help'));
    return section;
  }
  function renderResults() {
    const section=el('section');
    add(section,el('h3','Original current buyer records'),
      el('p','These are native job and saved-response records. The separate actual buyer handoff rechecks the retained response, analysis and finality before Grant receiving. Planned funding groups and allowance dates do not create additional purchases.','customer-use-help'));
    if(!state.view){add(section,el('p','Save this commission to read its bound original periods and results.'));return section;}
    add(section,button('Refresh original outcomes',()=>task('Reading original retained outcomes…',epoch=>openCommission(state.view.selected.id,state.view.selected.sha256,epoch,false))));
    for(const row of state.view.observations?.rows??[]) {
      const box=el('section',null,'customer-use-box');add(box,el('h4',row.task.name+' · '+row.calendarUse.date+' · '+row.calendarUse.mode));
      const chosen=el('input');chosen.type='checkbox';chosen.checked=state.captureIds.has(row.bindingId);
      chosen.addEventListener('change',()=>{if(chosen.checked)state.captureIds.add(row.bindingId);else state.captureIds.delete(row.bindingId);});
      add(box,add(el('label',null,'customer-use-choice'),chosen,el('span','Include this saved use in the buyer return')));
      add(box,table(['Original period / intent','Queue state','Saved response',''],row.requests.map(ref=>[
        ref.selection.collectionId+' / '+(ref.request?.intentId??ref.selection.requestKey),
        ref.item?.state??ref.error?.code??ref.periodPhase,
        ref.item?.job?.outcome?.responseFile?.status??'Not recorded',
        details('Original job and request',json(ref))])));
      if(row.responses.length)add(box,details('Retained reopen identities',json(row.responses)));
      add(section,box);
    }
    const capture=button('Capture selected original buyer results',captureReturn,'primary');
    capture.disabled=state.dirty;
    add(section,field('Verify up to this many bytes per retained response',state.maxVerifyBytes,
      value=>{state.maxVerifyBytes=value;},{help:'Default 268435456 bytes. Original capture permits at most 1 GiB per file and 1 GiB total; larger or unavailable outputs keep their actual unverified state.'}).wrap,
      capture,el('p','Capture only reads existing original Inbox jobs. It neither enqueues nor runs a request. A return contains at most 100 distinct intents.','customer-use-help'),
      el('h3','Saved buyer returns'),table(['Captured','Original jobs','Source / request',''],(state.view.returns??[]).map(row=>[
        row.capturedAt??'Original capture interrupted',row.counts?.jobs??'—',row.file?.sha256??row.requestId,
        row.state==='RETURNED'?button('Download exact return',()=>downloadReturn(row.requestId)):
          details('Continue original action',json(row))])));
    add(section,details('Original saved Calendar receipts and cohort comparison',json({receipts:state.view.review.receipts,
      conflicts:state.view.review.receiptConflicts,groups:state.view.review.groups,
      repeatedRequests:state.view.review.repeatedRequestBindings,qualification:state.view.review.qualification})));
    return section;
  }
  function renderLibrary() {
    const section=el('section'),uploadInput=el('input');uploadInput.type='file';uploadInput.accept='.json,application/json';uploadInput.hidden=true;
    uploadInput.addEventListener('change',()=>{void upload(uploadInput.files?.[0]);uploadInput.value='';});
    add(section,actions(button('Import saved Calendar export',()=>uploadInput.click(),'primary'),button('Open Request plans',onPlans),uploadInput),
      el('h3','Saved commissions'),table(['Commission','Revision','Saved',''],state.commissions.map(row=>[
        row.name,row.revision,row.createdAt,button('Open',()=>{if(canLeave())void task('Opening saved commission…',epoch=>openCommission(row.id,row.sha256,epoch));})])),
      el('h3','Retained original Calendar selections'),table(['Original export','Case / version','Installations',''],state.sources.map(row=>[
        row.name,row.case.caseId+' / '+row.case.caseVersion,row.installations.length,
        button('Commission this selection',()=>{if(canLeave())void task('Opening exact Calendar source…',epoch=>openSource(row.sha256,epoch));})])));
    return section;
  }
  function render(){
    host.replaceChildren();shell=el('fieldset',null,'customer-use-shell');content=el('div');
    const heading=add(el('div',null,'customer-use-heading'),add(el('div'),el('h2','Customer-use commissioning'),
      el('p','Turn saved useful tasks into reviewed periods and follow their original buyer results.','customer-use-help')),
      button('Refresh saved work',()=>void refresh()));
    notice=el('p',state.message,'customer-use-notice');notice.hidden=!state.message;notice.dataset.kind=state.error?'error':'status';
    notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
    add(shell,heading,notice,content);add(host,shell);
    if(!state.connected){add(content,el('p','Open an existing Collections workspace to commission customer use.'));sync();return;}
    if(state.pending){
      add(content,el('section',null,'customer-use-box'));
      const box=content.lastChild;add(box,el('h3','Continue the original action'),
        el('p',state.pending.kind+' · '+state.pending.input.requestId),
        actions(button('Inspect original result',reconcile),button('Continue exact request',continuePending),
          state.pending.notAdmitted&&state.pending.rejection?button('Return to editing and review current head',returnToEditing):null),
        details('Retained original input',json(state.pending.input)),
        state.pending.rejection?details('Original rejection',json(state.pending.rejection)):null);
    }
    if(state.rejected)add(content,details('Preserved rejected request and reviewed head',json(state.rejected),
      button('Download rejected request',()=>downloadLocal(state.rejected,state.rejected.action.input.requestId+'-rejected.json')),
      state.view?details('Current saved definition for comparison',json(state.view.document)):null));
    const editor=el('fieldset',null,'customer-use-editor');editor.disabled=Boolean(state.pending);add(content,editor);content=editor;
    if(!state.draft){add(content,renderLibrary());sync();return;}
    const saved=el('p',null,'customer-use-help');saved.dataset.useSaved='true';
    add(content,actions(button('Saved commissions',()=>{if(canLeave()){state.draft=null;state.view=null;state.source=null;state.dirty=false;render();}}),
      button('Download edited definition',()=>downloadLocal(state.draft,state.draft.id+'-edited.json')),
      button('Save commission revision',saveDraft,'primary')),saved,
      field('Commission name',state.draft.name,value=>{state.draft.name=value;changed();}).wrap,
      field('Stable commission reference',state.draft.id,value=>{state.draft.id=value;changed();},{readonly:Boolean(state.view)}).wrap,
      field('Operator',state.actor,value=>{state.actor=value;}).wrap,
      field('Commissioning note',state.draft.note,value=>{state.draft.note=value;changed();},{rows:2}).wrap,sourceDetails());
    if(state.view)add(content,select('Saved history',state.view.history.map(row=>[row.sha256,'Revision '+row.revision+' · '+row.createdAt]),state.view.selected.sha256,value=>{
      if(canLeave())void task('Opening original saved revision…',epoch=>openCommission(state.view.selected.id,value,epoch));
    }),el('p','Selected revision '+state.view.selected.revision+' · current head '+state.view.currentHead.revision,'customer-use-help'),
      actions(button('Export saved JSON',()=>exportSaved('json')),button('Export saved CSV',()=>exportSaved('csv'))));
    const tabs=el('nav',null,'customer-use-tabs');tabs.setAttribute('aria-label','Customer-use views');
    for(const [key,label]of [['uses','Useful tasks'],['periods','Periods and review'],['results','Buyer results']]){
      const tab=button(label,()=>{state.tab=key;render();});tab.setAttribute('aria-current',String(state.tab===key));tabs.append(tab);
    }
    add(content,tabs,state.tab==='uses'?renderUses():state.tab==='periods'?renderPeriods():renderResults());sync();
  }
  async function refresh() {
    return task('Refreshing saved commissions and original plans…',async epoch=>{
      await readLibrary(epoch);if(alive(epoch))render();
    });
  }
  function autoLoad(){if(state.visible&&state.connected&&!state.blocked&&!state.busy&&!state.attempted)void refresh();}
  window.addEventListener('beforeunload',event=>{if(state.dirty||state.pending){event.preventDefault();event.returnValue='';}});
  render();
  return {
    connect(status){
      if(state.workspace&&state.workspace!==status.directory)
        workspaces.set(state.workspace,{source:state.source,view:state.view,draft:state.draft,dirty:state.dirty,actor:state.actor,rejected:state.rejected});
      const changedWorkspace=state.workspace!==status.directory;state.epoch++;state.busy=false;onBusy(false);
      state.workspace=status.directory??null;state.queueRoot=status.queueRoot??null;state.connected=Boolean(state.workspace);
      if(changedWorkspace){
        const previous=workspaces.get(state.workspace);
        Object.assign(state,{source:null,view:null,draft:null,dirty:false,entry:null,planCache:new Map(),responseCache:new Map(),
          sources:[],commissions:[],plans:[],collections:[],captureIds:new Set(),pending:null,rejected:null,...previous});
      }
      state.attempted=false;
      try{state.pending=state.connected?readPending():null;}catch(error){fail(error);}
      render();autoLoad();
    },
    disconnect(){state.epoch++;state.connected=false;state.busy=false;onBusy(false);render();},
    setVisible(value){state.visible=Boolean(value);autoLoad();},
    setBlocked(value){state.blocked=Boolean(value);sync();autoLoad();},
    refresh,
  };
}
