// MIT. Same Support workspace: complete incident snapshots, private receiving and explicit queue reconciliation.
const add=(parent,tag,text,className='')=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;parent.append(node);return node;};
const button=(parent,label,action,className='secondary')=>{const node=add(parent,'button',label,className);node.type='button';node.addEventListener('click',action);return node;};
const when=value=>value?new Date(value).toLocaleString():'—';
const human=value=>String(value??'').toLowerCase().replaceAll('_',' ');
const byteText=value=>Number.isSafeInteger(value)?value.toLocaleString()+' bytes':'—';
const identifier=prefix=>prefix+'-'+crypto.randomUUID();
const actionNames={snapshot:'Save complete snapshot',receive:'Receive snapshot','abandon-snapshot':'Abandon incomplete snapshot',
  reconcile:'Reconcile notification hold',open:'Open received store'};

export function mountIncidentRecoveryDesk({root,request,getContext,onBusy,refreshParent,selectSource,signal}) {
  let destroyed=false,profile=null,workspaceId=null,identityChanged=false,data=null,epoch=0,requestEpoch=0,offset=0;
  let loading=false,ownBusy=false,verified=null,selectedSnapshot=null,history=[],historyProblem=null,confirmedRecovery=null;
  const urls=new Set();
  root.className='source-details incident-recovery';root.hidden=true;
  const heading=add(root,'summary','Snapshots and recovery');
  const body=add(root,'div',undefined,'incident-recovery-body');
  add(body,'h3','Save and reopen the complete incident store');
  add(body,'p','A snapshot retains the complete configuration, incident and notification history, and every referenced capture. Receiving creates a separate private store and holds unfinished notification deliveries.');
  const status=add(body,'p','','status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const scope=add(body,'div',undefined,'scope');
  const toolbar=add(body,'div',undefined,'actions');
  const refreshButton=button(toolbar,'Refresh recovery',()=>load());
  const directoryHint=add(body,'p','','hint');
  const createForm=add(body,'form',undefined,'incident-recovery-form');
  const createLabel=add(createForm,'label','Snapshot name / operation ID'),snapshotName=add(createLabel,'input');
  snapshotName.id='incident-snapshot-name';snapshotName.required=true;snapshotName.maxLength=96;snapshotName.pattern='[A-Za-z0-9][A-Za-z0-9._-]{0,95}';
  const selectionHint=add(createForm,'p','','hint');
  const createActions=add(createForm,'div',undefined,'actions');
  const create=add(createActions,'button','Save complete snapshot');create.type='submit';create.id='incident-snapshot-save';
  const newSelection=button(createActions,'New snapshot selection',async()=>{snapshotName.value=identifier('snapshot');await load();});
  const storageHint=add(body,'p','Incomplete snapshots keep their source captures pinned. Resume the same operation, or explicitly abandon it to release those references. Completed snapshots remain ordinary private directories that can be transferred intact.','hint');

  const listWrap=add(body,'div',undefined,'case-table-wrap'),table=add(listWrap,'table',undefined,'case-table');
  table.setAttribute('aria-label','Incident snapshots and received stores');
  const titles=add(add(table,'thead'),'tr');for(const label of ['Saved selection','State / identity','Complete data','Action'])add(titles,'th',label);
  const rows=add(table,'tbody');
  const paging=add(body,'div',undefined,'actions'),pageHint=add(paging,'span','','hint');
  const previous=button(paging,'Previous',()=>{offset=Math.max(0,offset-20);load();});
  const next=button(paging,'Next',()=>{offset+=20;load();});

  const receivePanel=add(body,'section',undefined,'incident-recovery-receive');receivePanel.hidden=true;
  add(receivePanel,'h4','Review the saved snapshot');
  const reviewed=add(receivePanel,'p','','hint'),reviewFacts=add(receivePanel,'div',undefined,'scope');
  const reviewDownloads=add(receivePanel,'div',undefined,'actions');
  const receiveForm=add(receivePanel,'form',undefined,'incident-recovery-form');
  const receiveLabel=add(receiveForm,'label','New received store name / operation ID'),receiveName=add(receiveLabel,'input');
  receiveName.id='incident-receive-name';receiveName.required=true;receiveName.maxLength=96;receiveName.pattern=snapshotName.pattern;
  const receiveButton=add(receiveForm,'button','Receive into a new private store');receiveButton.type='submit';receiveButton.id='incident-snapshot-receive';
  add(receivePanel,'p','The source store and saved snapshot stay intact. The received copy opens only after every required file has been verified. No watcher starts and no notification is sent by receiving.','hint');

  const reconciliation=add(body,'section',undefined,'incident-recovery-reconcile');reconciliation.hidden=true;
  add(reconciliation,'h4','Review the restored notification hold');
  const recoveryCopy=add(reconciliation,'p','','hint'),recoveryFacts=add(reconciliation,'div',undefined,'scope');
  const reconcileForm=add(reconciliation,'form',undefined,'incident-recovery-form');
  const byLabel=add(reconcileForm,'label','Operator name'),by=add(byLabel,'input');by.required=true;by.maxLength=160;by.autocomplete='name';
  const notesLabel=add(reconcileForm,'label','Reconciliation note'),notes=add(notesLabel,'textarea');notes.maxLength=2000;notes.rows=3;
  const stoppedLabel=add(reconcileForm,'label',undefined,'incident-recovery-confirmation'),stopped=add(stoppedLabel,'input');stopped.type='checkbox';stopped.required=true;
  add(stoppedLabel,'span','I have stopped the original writer and reviewed these original delivery attempts and receipts.');
  const reconcile=add(reconcileForm,'button','Release the global notification hold');reconcile.type='submit';reconcile.id='incident-recovery-reconcile';
  add(reconciliation,'p','Previously unfinished events stay paused. Use the existing notification history’s Retry delivery action to select an individual event. Accepted receipts and cancelled events retain their original final state.','hint');
  const queueDetails=add(reconciliation,'details',undefined,'source-details');add(queueDetails,'summary','Reviewed queue identities and deadlines');
  const queueRaw=add(queueDetails,'pre');queueRaw.tabIndex=0;

  const abandonPanel=add(body,'section',undefined,'incident-recovery-abandon');abandonPanel.hidden=true;
  add(abandonPanel,'h4','Abandon this incomplete snapshot');
  const abandonCopy=add(abandonPanel,'p','','hint');
  const abandonForm=add(abandonPanel,'form',undefined,'incident-recovery-form');
  const abandonByLabel=add(abandonForm,'label','Operator name'),abandonBy=add(abandonByLabel,'input');abandonBy.required=true;abandonBy.maxLength=160;
  const abandonNoteLabel=add(abandonForm,'label','Why this snapshot is being abandoned'),abandonNotes=add(abandonNoteLabel,'textarea');abandonNotes.required=true;abandonNotes.maxLength=2000;
  const abandonButton=add(abandonForm,'button','Abandon and release capture protection');abandonButton.type='submit';
  let abandonment=null;
  const requestsPanel=add(body,'details',undefined,'source-details');add(requestsPanel,'summary','Retained operation requests');
  add(requestsPanel,'p','A lost reply keeps the exact operation and selected hashes below. Continue that request to inspect or resume its original files.');
  const historyRows=add(requestsPanel,'div',undefined,'incident-recovery-requests');
  const clearCompleted=button(requestsPanel,'Clear completed browser entries',()=>{
    if(blocked())return;history=history.filter(row=>row.status!=='COMPLETED');persist();renderHistory();
  });
  const resultDetails=add(body,'details',undefined,'source-details');add(resultDetails,'summary','Last operation result');
  const resultRaw=add(resultDetails,'pre');resultRaw.tabIndex=0;

  const say=(message,error=false)=>{status.textContent=message;status.className=error?'status error':'status';};
  const current=()=>getContext();
  const blocked=()=>destroyed||ownBusy||loading||current().busy||identityChanged||Boolean(historyProblem)||!workspaceId;
  const apiBase=()=>'/api/incidents/'+encodeURIComponent(profile)+'/recovery';
  const storageKey=()=>workspaceId?'starforge:incident-recovery:'+workspaceId:null;
  const recoverySelection=value=>value?.deliveryPaused?{id:value.id,manifestSha256:value.manifestSha256,
    queueSha256:value.queueSha256,configHash:value.configHash}:null;
  const confirmationCurrent=()=>confirmedRecovery!==null&&
    JSON.stringify(confirmedRecovery)===JSON.stringify(recoverySelection(data?.recovery));
  function clearConfirmation(){confirmedRecovery=null;stopped.checked=false;}
  function clearReview() {verified=null;selectedSnapshot=null;receivePanel.hidden=true;reviewDownloads.replaceChildren();for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
  function persist() {
    const text=JSON.stringify(history);
    if(text.length>131072)throw new Error('Retained recovery requests exceed browser storage limits. Preserve or clear completed entries before starting another request.');
    localStorage.setItem(storageKey(),text);
  }
  function restoreHistory() {
    history=[];historyProblem=null;
    try {
      const raw=localStorage.getItem(storageKey());if(!raw)return;
      if(raw.length>131072)throw new Error('Stored recovery requests exceed the supported size.');
      const rows=JSON.parse(raw);
      if(!Array.isArray(rows)||rows.length>64||rows.some(row=>!row||!actionNames[row.action]||
        row.workspaceId!==workspaceId||typeof row.key!=='string'||!row.input||typeof row.input!=='object'||Array.isArray(row.input)))
        throw new Error('Stored recovery request identities are invalid.');
      history=rows;
    } catch(error){historyProblem=error.message;say(historyProblem+' The existing browser record was preserved.',true);}
  }
  function controls() {
    const disabled=blocked();
    for(const input of [snapshotName,receiveName,by,notes,stopped,abandonBy,abandonNotes])input.disabled=disabled;
    refreshButton.disabled=destroyed||ownBusy||loading||current().busy||identityChanged||!workspaceId;
    create.disabled=disabled||!data;newSelection.disabled=disabled;
    previous.disabled=disabled||!data||offset===0;next.disabled=disabled||!data?.page?.hasMore;
    receiveButton.disabled=disabled||!verified;
    reconcile.disabled=disabled||!data?.recovery?.deliveryPaused||!stopped.checked||!confirmationCurrent()||!by.value.trim();
    abandonButton.disabled=disabled||!abandonment;
    clearCompleted.disabled=disabled||!history.some(row=>row.status==='COMPLETED');
    for(const node of rows.querySelectorAll('button'))node.disabled=disabled;
    for(const node of historyRows.querySelectorAll('button'))node.disabled=disabled;
  }
  function fact(parent,label,value) {const row=add(parent,'div',undefined,'scope-row');add(row,'b',label);add(row,'span',String(value??'—'));}
  function renderHistory() {
    historyRows.replaceChildren();
    for(const row of [...history].reverse()) {
      const entry=add(historyRows,'div',undefined,'incident-recovery-request');
      add(entry,'strong',actionNames[row.action]+' · '+human(row.status));
      add(entry,'small',row.input.operationId??row.input.receiveName??row.key);
      if(row.detail)add(entry,'p',row.detail,'hint');
      if(row.status!=='COMPLETED')button(entry,'Continue original request',()=>perform(row.action,row.input,{existing:row.key}));
      const details=add(entry,'details');add(details,'summary','Exact reviewed input');
      add(details,'pre',JSON.stringify({workspaceId:row.workspaceId,action:row.action,input:row.input},null,2));
    }
    if(!history.length)add(historyRows,'p','No operation has been dispatched from this recovery view.','hint');
    controls();
  }
  function chooseAbandon(row) {
    if(blocked())return;
    const pins=Array.isArray(data?.pins)?data.pins:data?.pins?.pins??[];
    const pin=pins.find(pin=>pin.operationId===row.name&&pin.outputDirectory===row.directory&&!pin.released);
    abandonment={operationId:row.name,expectedPinSha256:pin?.pinSha256??null};
    abandonCopy.textContent=row.name+' · '+(pin?'This releases its pinned source captures.':'This selection has no active capture pin.')+
      ' Its request, partial files and abandonment record remain retained.';
    abandonBy.value=by.value;abandonNotes.value='';abandonPanel.hidden=false;controls();
  }
  function draw() {
    scope.replaceChildren();rows.replaceChildren();recoveryFacts.replaceChildren();
    if(!data){reconciliation.hidden=true;renderHistory();controls();return;}
    fact(scope,'Source revision',data.sourceRevision);fact(scope,'Recovery workspace',data.workspaceId);
    directoryHint.textContent='Private recovery directory: '+data.directory;
    selectionHint.textContent='Current reviewed source revision: '+data.sourceRevision+'. The original transaction lease freezes this revision.';
    for(const row of data.items??[]) {
      const tr=add(rows,'tr'),identity=add(tr,'td'),state=add(tr,'td'),size=add(tr,'td'),actions=add(tr,'td');
      add(identity,'strong',row.name);add(identity,'small',row.kind==='snapshot'?'Complete-store snapshot':'Received store');
      add(state,'span',human(row.status));if(row.manifestSha256)add(state,'small',row.manifestSha256);
      if(row.error)add(state,'small',row.error);
      add(size,'span',row.files?row.files.toLocaleString()+' files':'—');if(row.totalBytes)add(size,'small',byteText(row.totalBytes));
      if(row.kind==='snapshot'&&row.status==='SAVED')button(actions,'Verify and review',()=>inspect(row));
      if(row.kind==='received'&&row.status==='RECEIVED')button(actions,'Open received store',()=>perform('open',
        {receiveName:row.name,expectedManifestSha256:row.manifestSha256}));
      const pins=Array.isArray(data.pins)?data.pins:data.pins?.pins??[];
      const protectedSnapshot=row.kind==='snapshot'&&pins.some(pin=>pin.operationId===row.name&&pin.outputDirectory===row.directory&&!pin.released);
      if(row.request&&(row.status==='INCOMPLETE'||protectedSnapshot&&['SAVED','ABANDONED'].includes(row.status)))
        button(actions,row.status==='SAVED'?'Finish snapshot release':row.status==='ABANDONED'?
          'Finish abandonment release':'Resume same operation',()=>perform(row.request.action,row.request.input));
      if(row.kind==='snapshot'&&row.status==='INCOMPLETE'&&row.request)button(actions,'Abandon',()=>chooseAbandon(row),'text-button');
      if(!actions.childElementCount)add(actions,'span',row.status==='ABANDONED'?'Original selection retained':'—');
    }
    if(!data.items?.length)add(add(rows,'tr'),'td','No saved snapshots or received stores are present.').colSpan=4;
    pageHint.textContent=data.page.total?Math.min(offset+1,data.page.total)+'–'+Math.min(offset+20,data.page.total)+' of '+data.page.total:'0 saved entries';
    const recovery=data.recovery;
    if(confirmedRecovery&&!confirmationCurrent())clearConfirmation();
    reconciliation.hidden=!recovery;
    if(recovery) {
      recoveryCopy.textContent=recovery.deliveryPaused?
        'Notification delivery is held for this received store. Review the exact queue before releasing the global hold.':
        'The global hold was reconciled. Previously unfinished events still require their individual original retry.';
      fact(recoveryFacts,'Original recovery ID',recovery.id??recovery.operationId);
      fact(recoveryFacts,'Received',when(recovery.receivedAt));
      fact(recoveryFacts,'Manifest',recovery.manifestSha256);
      fact(recoveryFacts,'Reviewed queue',recovery.queueSha256);
      fact(recoveryFacts,'Configuration',recovery.configHash);
      fact(recoveryFacts,'Original attempt deadline',when((recovery.originalAttemptsWaiting??[]).map(row=>row.until).sort().at(-1)));
      queueRaw.textContent=JSON.stringify(recovery,null,2);
      reconcileForm.hidden=!recovery.deliveryPaused;
    }
    renderHistory();controls();
  }
  async function load() {
    if(destroyed||ownBusy||current().busy||loading||identityChanged||!workspaceId)return;
    const stamp=++requestEpoch,selectionEpoch=epoch,selectedProfile=profile,selectedWorkspace=workspaceId;
    loading=true;controls();
    try {
      const value=await request(apiBase()+'?'+new URLSearchParams({offset:String(offset),limit:'20'}));
      if(destroyed||selectionEpoch!==epoch||selectedProfile!==profile||stamp!==requestEpoch)return;
      if(value.workspaceId!==selectedWorkspace){identityChanged=true;data=null;throw new Error('The private recovery workspace changed. Reload the Support workspace and review its source selection.');}
      data=value;draw();say('Saved selections loaded. Verify a snapshot before receiving it.');
    } catch(error){if(!destroyed&&selectionEpoch===epoch)say(error.message,true);}
    finally{if(selectionEpoch===epoch){loading=false;controls();}}
  }
  function selectVerified(name,value) {
    clearReview();selectedSnapshot=name;verified=value;receivePanel.hidden=false;
    reviewed.textContent='Verified complete snapshot '+name+' · '+value.manifestSha256;
    reviewFacts.replaceChildren();
    for(const [label,amount]of [['Source revision',value.source.revision],['Merchants',value.source.merchants],
      ['Incidents',value.source.incidents],['Notifications',value.source.notifications],
      ['Captured observations',value.source.captures],['Files',value.files],['Size',byteText(value.totalBytes)]])fact(reviewFacts,label,amount);
    const url=URL.createObjectURL(new Blob([JSON.stringify(value.manifest,null,2)+'\n'],{type:'application/json'}));urls.add(url);
    const link=add(reviewDownloads,'a','Download verified manifest');link.href=url;link.download='incident-'+name+'-manifest.json';
    receiveName.value=identifier('received');controls();
  }
  async function inspect(row) {
    if(blocked())return;
    const selectedEpoch=epoch;ownBusy=true;onBusy(true);clearReview();controls();
    try {
      const result=await request(apiBase()+'/inspect-snapshot',{workspaceId,input:{
        snapshotName:row.name,expectedManifestSha256:row.manifestSha256}});
      if(!destroyed&&selectedEpoch===epoch){selectVerified(row.name,result);say('Every required snapshot file and captured observation was verified.');}
    } catch(error){if(!destroyed&&selectedEpoch===epoch)say(error.message,true);}
    finally{ownBusy=false;onBusy(false);controls();}
  }
  async function perform(action,input,{existing=null}={}) {
    if(blocked())return;
    const selectedEpoch=epoch,selectedProfile=profile,selectedWorkspace=workspaceId;
    let record=existing?history.find(row=>row.key===existing):null;
    try {
      if(!record) {
        const key=action+':'+(input.operationId??input.receiveName??crypto.randomUUID());
        record=history.find(row=>row.key===key);
        if(record&&JSON.stringify(record.input)!==JSON.stringify(input))
          throw new Error('This operation ID already has a different retained review. Select a new operation name.');
        if(!record) {
          if(history.length>=64)throw new Error('Preserve or clear completed browser entries before starting another operation.');
          record={key,workspaceId:selectedWorkspace,action,input:JSON.parse(JSON.stringify(input)),createdAt:new Date().toISOString(),status:'PREPARED'};
          history.push(record);
        }
      }
      if(record.workspaceId!==selectedWorkspace||record.action!==action||JSON.stringify(record.input)!==JSON.stringify(input))
        throw new Error('The retained operation belongs to another recovery selection.');
      record.status='DISPATCHING';record.detail=null;persist();
    } catch(error){say(error.message,true);renderHistory();return;}
    ownBusy=true;onBusy(true);controls();
    let opened=null,snapshotResult=null;
    try {
      const result=await request(apiBase()+'/'+action,{workspaceId:selectedWorkspace,input:record.input});
      record.status='COMPLETED';record.detail='Original operation returned at '+new Date().toISOString();
      try{persist();}catch(error){say('The operation returned, but browser history could not be updated. Its original saved files remain authoritative: '+error.message,true);}
      if(!destroyed&&selectedEpoch===epoch) {
        const summary={...result};if(summary.manifest)delete summary.manifest;
        resultRaw.textContent=JSON.stringify(summary,null,2);
        if(action==='snapshot')snapshotResult=result;
        if(action==='receive'){clearReview();say('Complete snapshot received. Open the received store to review its held queue.');}
        else if(action==='open')opened=result;
        else if(action==='reconcile'){clearConfirmation();say('Global hold reconciled. Previously unfinished notifications remain individually paused.');}
        else if(action==='abandon-snapshot'){abandonPanel.hidden=true;abandonment=null;say('The snapshot was abandoned and its capture pin released. Partial files and the original request remain.');}
        else say('The original '+human(action)+' operation completed.');
      }
    } catch(error) {
      record.status='NEEDS_RECONCILIATION';record.detail=error.message;
      try{persist();}catch{}
      if(!destroyed&&selectedEpoch===epoch)say(error.message+' The exact original request is retained below.',true);
    } finally {
      ownBusy=false;onBusy(false);
      if(!destroyed&&selectedEpoch===epoch&&selectedProfile===profile){
        renderHistory();
        if(opened){try{await selectSource(opened.source.id,opened.profiles);}catch(error){say('The received store remains saved. Opening its Support profile needs attention: '+error.message,true);}}
        else {await refreshParent();await load();if(snapshotResult&&selectedEpoch===epoch)selectVerified(input.operationId,snapshotResult);}
      }
      controls();
    }
  }
  createForm.addEventListener('submit',event=>{event.preventDefault();if(!createForm.reportValidity()||!data)return;
    perform('snapshot',{operationId:snapshotName.value.trim(),expectedRevision:data.sourceRevision});},{signal});
  receiveForm.addEventListener('submit',event=>{event.preventDefault();if(!receiveForm.reportValidity()||!verified)return;
    perform('receive',{operationId:receiveName.value.trim(),snapshotName:selectedSnapshot,expectedManifestSha256:verified.manifestSha256});},{signal});
  reconcileForm.addEventListener('submit',event=>{event.preventDefault();
    if(!reconcileForm.reportValidity()||!confirmationCurrent()){
      clearConfirmation();controls();say('Review and confirm the current recovery queue before reconciliation.',true);return;
    }
    const value=confirmedRecovery;
    perform('reconcile',{operationId:identifier('reconcile'),expectedRecoveryId:value.id,
      expectedManifestSha256:value.manifestSha256,expectedQueueSha256:value.queueSha256,
      expectedConfigHash:value.configHash,originalWriterStopped:true,by:by.value.trim(),notes:notes.value});},{signal});
  abandonForm.addEventListener('submit',event=>{event.preventDefault();if(!abandonForm.reportValidity()||!abandonment)return;
    perform('abandon-snapshot',{...abandonment,by:abandonBy.value.trim(),notes:abandonNotes.value});},{signal});
  by.addEventListener('input',controls,{signal});
  stopped.addEventListener('input',()=>{
    confirmedRecovery=stopped.checked?recoverySelection(data?.recovery):null;
    if(!confirmedRecovery)stopped.checked=false;controls();
  },{signal});
  root.addEventListener('toggle',()=>{if(root.open)load();},{signal});
  return {
    update(value) {
      if(destroyed)return;
      const source=value?.source,selected=source?.id??null,identity=source?.recovery?.workspaceId??null;
      root.hidden=!source;
      if(profile!==selected) {
        profile=selected;workspaceId=identity;epoch++;requestEpoch++;data=null;offset=0;identityChanged=false;loading=false;
        clearReview();abandonment=null;abandonPanel.hidden=true;clearConfirmation();snapshotName.value=identifier('snapshot');
        receiveName.value=identifier('received');history=[];historyProblem=null;
        if(workspaceId)restoreHistory();
        draw();
        if(root.open&&workspaceId)void load();
      } else if(workspaceId&&identity!==workspaceId) {
        identityChanged=true;data=null;clearReview();clearConfirmation();draw();
        say('The selected recovery workspace changed. Reload Support before dispatching an operation.',true);
      }
      if(!identity&&!identityChanged) {
        say('To enable complete-store recovery, configure this source’s private recoveryDirectory in its existing incident-sources file.');
        data=null;directoryHint.textContent='The startup capability chooses the only directory this browser can use.';
      }
      if(data&&value?.revision&&data.sourceRevision!==value.revision)
        selectionHint.textContent='Source revision changed to '+value.revision+'. Refresh recovery before selecting a new snapshot.';
      controls();
    },
    refreshControls:controls,
    destroy(){destroyed=true;epoch++;requestEpoch++;for(const url of urls)URL.revokeObjectURL(url);urls.clear();root.replaceChildren();}
  };
}
