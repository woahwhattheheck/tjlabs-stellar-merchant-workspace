// MIT. Named unfinished scenario work in the original native workspace.
export function createScenarioWorking({api,run,snapshot,restore,markSaved,notice,hasEdits,recoverPlan}) {
  const $=id=>document.getElementById(id);
  let active=null,pendingWrite=null,pendingImport=null,list=[],savedFingerprint=null;
  const same=()=>snapshot()&&JSON.stringify(snapshot())===savedFingerprint;
  function status(message){$('working-status').textContent=message;}
  function controls(busy=false) {
    const state=snapshot(),pendingPlan=Boolean(state?.document.pendingPlanSave);
    $('working-save').disabled=busy||!state;
    $('working-fork').disabled=busy||!state;
    $('working-download').disabled=!state;
    $('working-export').disabled=busy||!active;
    $('working-open').disabled=busy||!$('working-list').value;
    $('working-open-revision').disabled=busy||!active||!$('working-revision').value;
    $('working-recover-plan').disabled=busy||!pendingPlan;
    $('working-file').disabled=busy||Boolean(pendingImport);
    $('working-import').textContent=pendingImport?'Recover original receiving':'Receive as new copy';
    $('working-save').textContent=pendingWrite?'Retry working-copy save':'Save working copy';
  }
  function renderList() {
    const selected=$('working-list').value;$('working-list').replaceChildren();
    for(const row of list) {
      const option=document.createElement('option');option.value=row.workingCopyId;
      option.textContent=row.label+' · '+row.scenarioCount+' alternatives · '+row.savedAt;
      $('working-list').append(option);
    }
    if(list.some(row=>row.workingCopyId===selected))$('working-list').value=selected;
    if(!list.length){const option=document.createElement('option');option.value='';option.textContent='No saved working copies';$('working-list').append(option);}
    $('working-count').textContent=list.length+' named working copies';
  }
  async function refresh() { const result=await api('/api/planning/working/list',{});list=result.copies;renderList();return result; }
  function renderHistory(rows=[]) {
    $('working-revision').replaceChildren();
    for(const row of rows.slice().reverse()) {
      const option=document.createElement('option');option.value=row.revision;option.textContent=row.savedAt+' · '+row.label;
      $('working-revision').append(option);
    }
    if(active)$('working-revision').value=active.revision;
  }
  function localDownload(value,name) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function publishPending() {
    try {
      const result=await api('/api/planning/working/save',pendingWrite);
      active={workingCopyId:result.workingCopyId,revision:result.revision,receivedFrom:result.receivedFrom??null};
      pendingWrite=null;return result;
    }catch(error) {
      if(error.status===409||['WORKING_COPY_INVALID','WORKING_COPY_TOO_LARGE','WORKING_COPY_SAVE_REQUIRED'].includes(error.code))pendingWrite=null;
      status(error.status===409?'Saved work changed in another window. Your inputs remain here. Save as a new copy, or open the newer revision.':
        'Save response interrupted. Your inputs and original request remain here; retry the working-copy save or download unfinished inputs.');
      throw error;
    }
  }
  async function saveCurrent({fork=false}={}) {
    const state=snapshot();if(!state)throw new Error('Load an original pricing review first.');
    if(pendingWrite)await publishPending();
    if(!fork&&active&&same())return active;
    const request={workingCopyId:fork||!active?crypto.randomUUID():active.workingCopyId,
      expectedRevision:fork||!active?null:active.revision,requestId:crypto.randomUUID(),version:state.version,
      sourceBinding:state.sourceBinding,document:structuredClone(state.document),
      receivedFrom:fork?null:active?.receivedFrom??null};
    pendingWrite=request;const result=await publishPending();
    savedFingerprint=JSON.stringify(state);markSaved();renderHistory([{...result}]);
    history.replaceState(null,'','#working/'+result.workingCopyId);
    status('Saved · '+result.label+' · '+result.savedAt);
    try{await refresh();}catch{notice('Working copy saved. Its identity and unfinished inputs are retained; refresh the list when available.');}
    return result;
  }
  function shouldReplace() {
    return !(hasEdits()||pendingWrite)||window.confirm('Replace the current unfinished form? Save it as a working copy or download unfinished inputs first if you want to keep these edits.');
  }
  async function openCopy(workingCopyId,revision,{confirmed=false}={}) {
    if(!confirmed&&!shouldReplace())return false;
    const result=await api('/api/planning/working/load',{workingCopyId,...(revision?{revision}:{})});
    // Receive the exact source and selected revision before changing any editor state.
    await restore(result.record.document,result.source);
    active={workingCopyId:result.workingCopyId,revision:result.revision,receivedFrom:result.receivedFrom??null};
    pendingWrite=null;savedFingerprint=JSON.stringify(snapshot());markSaved();renderHistory(result.history);
    history.replaceState(null,'','#working/'+workingCopyId+'/'+result.revision);
    status(result.revision===result.latestRevision?'Original working copy reopened.':'Earlier original working revision opened. Save as a new copy to continue separately.');
    notice(result.record.document.pendingPlanSave?'The original final comparison save is pending. Recover that same request to continue.':'Unfinished alternatives reopened with their original pricing review.');
    return true;
  }
  $('working-save').addEventListener('click',()=>run(()=>saveCurrent()));
  $('working-fork').addEventListener('click',()=>run(()=>saveCurrent({fork:true})));
  $('working-refresh').addEventListener('click',()=>run(refresh));
  $('working-open').addEventListener('click',()=>run(()=>openCopy($('working-list').value)));
  $('working-open-revision').addEventListener('click',()=>run(()=>openCopy(active.workingCopyId,$('working-revision').value)));
  $('working-list').addEventListener('change',()=>controls());
  $('working-revision').addEventListener('change',()=>controls());
  $('working-download').addEventListener('click',()=>{
    const state=snapshot();if(!state)return;
    localDownload({schema:'stellar-forge.merchant-scenario-working-inputs.v1',source:state.sourceBinding,
      document:state.document},'scenario-unfinished-inputs.json');
    notice('The complete unfinished inputs and original source identity were downloaded.');
  });
  $('working-export').addEventListener('click',()=>run(async()=>{
    const result=await api('/api/planning/working/export',{workingCopyId:active.workingCopyId,revision:active.revision});
    localDownload(result,'scenario-working-'+active.workingCopyId+'.json');
    notice('The selected saved working revision was exported with its complete original record.');
  }));
  $('working-import').addEventListener('click',()=>run(async()=>{
    if(!shouldReplace())return;
    if(!pendingImport) {
      const file=$('working-file').files?.[0];if(!file)throw new Error('Select an original working copy or unfinished-inputs JSON.');
      if(file.size>8*1024*1024)throw new Error('A working-copy input supports up to 8 MiB.');
      let packet;try{packet=JSON.parse(await file.text());}catch{throw new Error('The selected working-copy JSON is unreadable.');}
      pendingImport={package:packet,workingCopyId:crypto.randomUUID(),requestId:crypto.randomUUID()};
    }
    let result;
    try { result=await api('/api/planning/working/import',pendingImport); }
    catch(error) {
      if((error.status===409||error.status===422)&&[
        'WORKING_COPY_INVALID','WORKING_COPY_TOO_LARGE','WORKING_COPY_SAVE_REQUIRED',
        'WORKING_PACKAGE_CHANGED','WORKING_IMPORT_ID_REQUIRED','WORKING_SOURCE_CHANGED',
        'WORKING_ROUTE_CHANGED','WORKING_REQUEST_CHANGED','WORKING_COPY_CONFLICT'
      ].includes(error.code))pendingImport=null;
      throw error;
    }
    await openCopy(result.workingCopyId,undefined,{confirmed:true});
    pendingImport=null;$('working-file').value='';await refresh();
  }));
  $('working-recover-plan').addEventListener('click',()=>run(async()=>{await recoverPlan();await saveCurrent();}));
  return {controls,refresh,saveCurrent,openCopy,
    reset(){active=null;pendingWrite=null;savedFingerprint=null;renderHistory();status('Unfinished work · save a named working copy to retain it.');},
    changed(){status(active?(same()?'Working copy matches its saved revision.':'Unsaved changes to this working copy.'): 'Unfinished work · save a named working copy to retain it.');},
    async initialize(){await refresh();const match=/^#working\/([a-f0-9-]{36})(?:\/([a-f0-9]{64}))?$/.exec(location.hash);
      return match?openCopy(match[1],match[2],{confirmed:true}):false;}
  };
}
