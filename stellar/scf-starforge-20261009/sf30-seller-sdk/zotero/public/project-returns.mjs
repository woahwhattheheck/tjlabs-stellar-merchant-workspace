// MIT. Complete returned-project review in the original Zotero operator.
// Full source packets remain in the native store; this working copy contains selections and exact pending requests.
export function createProjectReturnsView(ui) {
  const {el,append,field,options,row,panel,table,note,button,http,invoke,digest,saveDownload,detail,toast}=ui;
  const drafts=new Map();let active=null,serial=0,selectedFile=null,storageError=null;
  const prefix='zotero-project-return-review-v1:';
  function blank(workspaceId){return {schema:'stellar-forge.zotero-project-return-working.v1',workspaceId,projectId:null,returnId:null,
    offset:0,pageOffsets:[],choices:{},choicesDirty:false,choicesInitialized:false,note:'',previewSha256:null,pending:null,rejected:[],source:null};}
  function read(workspaceId){
    if(drafts.has(workspaceId))return drafts.get(workspaceId);
    let value=blank(workspaceId);
    try{const saved=JSON.parse(sessionStorage.getItem(prefix+workspaceId)??'null');if(saved?.schema===value.schema&&saved.workspaceId===workspaceId)value={...value,...saved};}
    catch{storageError='The saved review could not be read. Download the current working copy before closing this page.';}
    drafts.set(workspaceId,value);return value;
  }
  function keep(d,required=false){
    drafts.set(d.workspaceId,d);
    try{sessionStorage.setItem(prefix+d.workspaceId,JSON.stringify(d));storageError=null;}
    catch{storageError='Browser storage is unavailable. Current choices remain in this tab; download the complete review working copy. New native actions require durable request storage.';
      if(required)throw new Error(storageError);}
  }
  const visible=c=>active===c&&ui.current(c.context)&&c.serial===serial;
  const guard=c=>{if(!visible(c))throw new Error('The selected return changed. Reopen its current comparison before continuing.');};
  function feedback(c,text){if(visible(c))toast(text);}
  function downloaded(name,value){
    const bytes=new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
    return digest(bytes).then(sha256=>saveDownload({name,bytes,sha256}));
  }
  async function recordFile(kind,id,role,revision){
    return http('/api/download?'+new URLSearchParams({kind,id,...(role?{role}:{}),...(revision?{revision}:{})}),{file:true});
  }
  async function fullList(kind,c){
    const rows=[];let offset=0;
    do{const page=await invoke('record.list',{kind,offset,limit:1000,...(kind==='project-return'?{projection:'summary'}:{})});guard(c);rows.push(...page.rows);
      if(page.next===null||page.next===undefined)break;offset=page.next;
    }while(true);
    return rows;
  }
  async function perform(c,action){
    const d=c.d;
    if(d.pending&&JSON.stringify(d.pending)!==JSON.stringify(action))throw new Error('Resume the original pending request before starting another native action.');
    d.pending=structuredClone(action);keep(d,true);
    let result;
    if(action.type==='import'){
      try{
      const file=selectedFile;if(!file)throw new Error('Select the original returned file again to resume this exact intake.');
      const bytes=await file.arrayBuffer(),hash=await digest(bytes);
      if(hash!==action.sha256||bytes.byteLength!==action.bytes)throw new Error('The selected bytes differ from the retained original intake. Select the original complete file.');
      result=await http('/api/project-return/import?'+new URLSearchParams({projectId:action.projectId}),
        {method:'POST',bytes,requestId:action.requestId});
      }catch(error){if(visible(c))await mount(c.context).catch(()=>{});throw error;}
    }else {
      try{result=await invoke(action.method,action.input,action.requestId);}
      catch(error){
        const code=error.code??error.error??error.message;
        const definite=['ZOTERO_RETURN_REVISION_CONFLICT','ZOTERO_RETURN_PROJECT_CHANGED','ZOTERO_RETURN_PREVIEW_CHANGED','ZOTERO_RETURN_REVIEW_REQUIRED','ZOTERO_RETURN_ALREADY_APPLIED'];
        if(definite.includes(code)){
          d.rejected.push({action:structuredClone(action),code,at:new Date().toISOString()});
          d.pending=null;d.previousReview={previewSha256:d.previewSha256,choices:structuredClone(d.choices),note:d.note};d.choices={};d.choicesDirty=false;d.choicesInitialized=false;d.previewSha256=null;keep(d,true);
          if(visible(c))await mount(c.context);
          throw new Error(code+' — no native write was committed. The rejected input and previous choices remain in the working copy; review the current comparison.');
        }
        if(visible(c))await mount(c.context).catch(()=>{});
        throw error;
      }
    }
    // Save the complete received result before forgetting the exact request.
    d.lastResult={action:structuredClone(action),record:result.record??null,returnRecord:result.returnRecord??null,
      project:action.method==='project.return.apply'?{id:result.value.id,revision:result.value.revision}:null,
      status:result.value?.status??null};
    if(action.type==='import'){d.returnId=result.record.id;d.projectId=action.projectId;d.offset=0;d.pageOffsets=[];d.choices={};d.choicesDirty=false;d.choicesInitialized=false;d.note='';d.previewSha256=null;d.source={name:action.filename,bytes:action.bytes,sha256:action.sha256};}
    if(action.method==='project.return.prepare')d.delivery={id:result.record.id,revision:result.record.revision,projectId:action.input.projectId};
    if(action.method==='project.return.review'){d.choices={};d.choicesDirty=false;d.choicesInitialized=false;d.previewSha256=null;d.note=action.input.note;}
    if(action.method==='project.return.apply'){d.applied={id:result.value.id,revision:result.value.revision};d.choices={};d.choicesDirty=false;d.choicesInitialized=false;}
    keep(d,true);d.pending=null;keep(d,true);
    if(visible(c)){await ui.refresh({render:false});await mount(c.context);}
    return result;
  }
  function operation(method,input){return {type:'invoke',method,input:structuredClone(input),requestId:crypto.randomUUID()};}
  function valueCell(value){
    if(!value?.present)return el('span','Absent',{class:'muted'});
    const body=typeof value.value==='string'?value.value:JSON.stringify(value.value,null,2);
    const details=el('details',null,{class:'return-value'});
    append(details,el('summary',typeof value.value==='string'?('Text · '+body.length+' characters'):Array.isArray(value.value)?('List · '+value.value.length+' entries'):'Complete value'),
      el('pre',body));return details;
  }
  async function mount(context){
    const workspaceId=ui.state().workspaceId,d=read(workspaceId),c={context,d,serial:++serial};
    active=c;
    const host=ui.main;host.replaceChildren();
    append(host,el('h1','Returned project review'),el('p','Receive a customer’s complete returned project, compare it with the shared original and current local work, then save explicit choices before applying a new project revision.',{class:'muted'}));
    const recoveryFile=field('Open review working copy','file');recoveryFile.node.accept='.json,application/json';
    recoveryFile.node.onchange=()=>{ /* selection is read only when explicitly opened */ };
    const recovery=panel('Continue this review',row(
      button('Download review working copy',()=>downloaded('zotero-project-return-working.json',d),true),
      button('Open selected working copy',async()=>{
        if(d.pending)throw new Error('Resume the original pending request before replacing its working copy.');
        const f=recoveryFile.node.files[0];if(!f)throw new Error('Select a complete review working copy.');
        if(f.size>16*1024*1024)throw new Error('The review working copy exceeds 16 MiB; keep the original file and use its saved native return.');
        const next=JSON.parse(await f.text());guard(c);
        if(next?.schema!==d.schema||next.workspaceId!==workspaceId||!next.choices||typeof next.choices!=='object'||Array.isArray(next.choices))throw new Error('This is not a review working copy for the current original workspace.');
        for(const side of Object.values(next.choices))if(!['local','returned','base'].includes(side))throw new Error('The review contains an invalid explicit choice.');
        if(next.pending){const p=next.pending;if(!/^[a-f0-9-]{36}$/i.test(p.requestId??'')||!['invoke','import'].includes(p.type)||
          p.type==='invoke'&&!['project.return.prepare','project.return.review','project.return.apply'].includes(p.method))throw new Error('The retained request is not a project-return operation.');}
        const restored={...blank(workspaceId),...next};drafts.set(workspaceId,restored);keep(restored,true);selectedFile=null;await mount(context);
      },true)),recoveryFile.wrap);
    if(storageError)recovery.append(note(storageError));
    if(d.lastResult)recovery.append(button('Inspect last original result',async()=>{
      const reference=d.lastResult.returnRecord??d.lastResult.record;
      const value=reference?await invoke('record.get',reference):null;
      detail('Original request and complete retained result',{...d.lastResult,value});
    },true));
    if(d.previousReview)recovery.append(button('Inspect previous review choices',()=>detail('Retained previous comparison choices',d.previousReview),true));
    host.append(recovery);
    if(d.pending){
      host.append(panel('Resume original request',note('A native response has not been durably acknowledged in this browser. The original UUID and input remain selected; no replacement action will be sent.'),
        el('code',d.pending.requestId),el('p',d.pending.type==='import'?'Select the exact original returned file below, then resume.':d.pending.method),
        row(button('Resume original request',()=>perform(c,d.pending)),button('Inspect exact pending input',()=>detail('Original pending request',d.pending),true))));
    }
    const projects=await fullList('project',c);guard(c);
    if(!projects.length){host.append(note('Create or receive an original project in Projects before preparing or reviewing a customer return.'));return;}
    if(!projects.some(p=>p.id===d.projectId))d.projectId=projects[0].id;
    const selector=field('Original project','select');
    options(selector.node,projects.map(p=>({value:p.id,label:p.title+' · revision '+p.revision})),d.projectId);
    selector.node.disabled=!!d.pending;
    selector.node.onchange=()=>{
      if(d.pending)return;d.projectId=selector.node.value;d.returnId=null;d.offset=0;d.pageOffsets=[];d.choices={};d.choicesDirty=false;d.choicesInitialized=false;d.note='';d.previewSha256=null;keep(d);selectedFile=null;mount(context).catch(e=>toast(e.message,true));
    };
    const p=projects.find(p=>p.id===d.projectId);
    host.append(selector.wrap);
    const prepare=button('Prepare complete project handover',()=>perform(c,operation('project.return.prepare',{projectId:p.id,projectRevision:p.revision})));
    prepare.disabled=!!d.pending;
    const delivery=panel('Give the customer the original project',el('p','Prepare a complete source-bound project history. The customer edits a received copy and returns its complete project handover or whole workspace packet.'),prepare);
    if(d.delivery?.projectId===p.id)delivery.append(button('Download prepared project handover',async()=>saveDownload(await recordFile('project-delivery',d.delivery.id,null,d.delivery.revision)),true));
    host.append(delivery);
    const file=field('Complete returned project or workspace JSON','file');file.node.accept='.json,application/json';
    file.node.onchange=()=>{selectedFile=file.node.files[0]??null;};
    const intake=button('Retain complete returned source',async()=>{
      if(d.pending)throw new Error('Resume the retained request first.');
      const chosen=selectedFile;if(!chosen)throw new Error('Select the customer’s complete returned JSON.');
      if(chosen.size>256*1024*1024)throw new Error('The complete packet exceeds the native 256 MiB transfer capacity. The original file has not been altered.');
      const bytes=await chosen.arrayBuffer(),sha256=await digest(bytes);guard(c);
      if(selectedFile!==chosen)throw new Error('The selected file changed. Review the current file before intake.');
      return perform(c,{type:'import',requestId:crypto.randomUUID(),projectId:p.id,sha256,bytes:bytes.byteLength,filename:chosen.name});
    });intake.disabled=!!d.pending;
    host.append(panel('Retain the customer’s returned source',file.wrap,selectedFile?el('p','Selected in this tab: '+selectedFile.name):null,
      d.source?el('p','Last retained source: '+d.source.name+' · '+d.source.bytes+' bytes · '+d.source.sha256,{class:'compact'}):null,intake));
    const returns=(await fullList('project-return',c)).filter(r=>r.projectId===p.id);guard(c);
    const pick=field('Saved return','select');options(pick.node,[{value:'',label:'Choose a retained return'},...returns.map(r=>({value:r.id,label:r.id+' · '+r.status+' · r'+r.revision}))],d.returnId??'');
    pick.node.disabled=!!d.pending;
    pick.node.onchange=()=>{if(d.pending)return;d.returnId=pick.node.value||null;d.offset=0;d.pageOffsets=[];d.choices={};d.choicesDirty=false;d.choicesInitialized=false;d.note='';d.previewSha256=null;keep(d);mount(context).catch(e=>toast(e.message,true));};
    host.append(pick.wrap);
    if(!d.returnId){host.append(note('Retain a returned source or choose an existing return. Original local work remains unchanged until explicit reviewed apply.'));return;}
    const preview=await invoke('project.return.preview',{id:d.returnId,offset:d.offset,limit:40});guard(c);
    const comparisonChanged=d.previewSha256!==preview.previewSha256;
    if(comparisonChanged&&d.previewSha256&&(d.choicesDirty||d.note!==(preview.review?.note??''))){
      d.previousReview={previewSha256:d.previewSha256,choices:structuredClone(d.choices),note:d.note};
      host.append(note('The native comparison changed. Previous choices are retained in the working copy; review this current comparison before choosing again.'));
    }
    if(comparisonChanged||!d.choicesInitialized){
      const saved=await invoke('record.get',{kind:'project-return',id:preview.id,revision:preview.revision});guard(c);
      d.choices=structuredClone(preview.review?.stale?{}:saved.review?.choices??{});
      d.choicesDirty=false;d.choicesInitialized=true;d.previewSha256=preview.previewSha256;
      d.note=preview.review?.note??'';
    }
    keep(d);let applyControl=null;
    const draftChanged=()=>d.choicesDirty||d.note!==(preview.review?.note??'');
    const syncApply=()=>{if(applyControl)applyControl.disabled=!!d.pending||preview.status!=='REVIEWED'||!preview.ready||draftChanged();};
    host.append(panel('Exact comparison',table(['Source','Revision','Original SHA-256'],[
      ['Shared original'+(preview.base?.via?' · '+preview.base.via.kind+' / '+preview.base.via.id+' / r'+preview.base.via.revision:''),preview.base?.revision??'Not found',el('code',preview.base?.sha256??'No exact common ancestor')],
      ['Current local project',preview.local.revision,el('code',preview.local.sha256)],
      ['Returned project',preview.returned.revision,el('code',preview.returned.sha256)]]),
      el('p',preview.libraryIdentity+' · edition '+preview.editionId,{class:'compact'}),
      el('p',preview.summary.changes+' changed values · '+preview.summary.conflicts+' conflicts · '+preview.summary.unresolved+' unresolved · '+preview.status),
      row(button('Download original returned bytes',async()=>saveDownload(await recordFile('project-return',d.returnId,'source',preview.revision)),true),
        button('Download saved review',async()=>saveDownload(await recordFile('project-return',d.returnId,null,preview.revision)),true),
        button('Complete return history',async()=>detail('Saved return history',await invoke('record.history',{kind:'project-return',id:d.returnId})),true))));
    if(preview.issues?.length)host.append(panel('Resolve source or project issues',...preview.issues.map(i=>note(i.message||i.code))));
    const rows=preview.rows.map(r=>{
      const choice=field('Choice for '+r.label,'select');
      options(choice.node,[{value:'',label:r.conflict?'Choose explicitly':'Use automatic '+r.automatic},
        {value:'local',label:'Keep current local'},{value:'returned',label:'Use returned value'},{value:'base',label:'Use shared original'}],d.choices[r.id]??'');
      choice.node.disabled=!!d.pending||preview.status==='APPLIED';
      choice.node.onchange=()=>{if(d.pending)return;if(choice.node.value)d.choices[r.id]=choice.node.value;else delete d.choices[r.id];d.choicesDirty=true;keep(d);syncApply();};
      return [append(el('div'),el('strong',r.label),el('code',r.path.join(' / ')),r.conflict?el('div','Conflict',{class:'tag'}):el('div','Automatic '+r.automatic,{class:'muted'})),
        valueCell(r.base),valueCell(r.local),valueCell(r.returned),choice.wrap];
    });
    host.append(table(['Changed value','Shared original','Current local','Customer return','Choice'],rows));
    if(!rows.length)host.append(note('There are no changed values on this comparison page.'));
    const previous=button('Previous changes',async()=>{d.offset=(d.pageOffsets??[]).pop()??Math.max(0,d.offset-40);keep(d);await mount(context);},true),
      next=button('Next changes',async()=>{if(preview.nextOffset!==null){(d.pageOffsets??=[]).push(d.offset);d.offset=preview.nextOffset;keep(d);await mount(context);}},true);
    previous.disabled=d.offset===0;next.disabled=preview.nextOffset===null;
    host.append(row(previous,el('span','Showing '+(preview.rows.length?d.offset+1:0)+'–'+(d.offset+preview.rows.length)+' of '+preview.summary.changes),next));
    const reviewNote=field('Review note','textarea',d.note);reviewNote.node.disabled=!!d.pending||preview.status==='APPLIED';
    reviewNote.node.oninput=()=>{if(d.pending)return;d.note=reviewNote.node.value;keep(d);syncApply();};
    const save=button('Save reviewed choices',async()=>{
      const choices=structuredClone(d.choices);
      const result=await perform(c,operation('project.return.review',{id:d.returnId,expectedRevision:preview.revision,
        expectedProjectRevision:preview.local.revision,previewSha256:preview.previewSha256,choices,note:d.note}));
      feedback(c,'Reviewed choices saved in the original project history.');return result;
    });
    save.disabled=!!d.pending||preview.status==='APPLIED';
    const apply=button('Apply reviewed return as a new project revision',()=>perform(c,operation('project.return.apply',{
      id:d.returnId,expectedRevision:preview.revision,expectedProjectRevision:preview.local.revision,previewSha256:preview.previewSha256})));
    applyControl=apply;syncApply();
    host.append(panel('Save and apply',reviewNote.wrap,el('p','Saving a partial review retains its decisions without changing the project. Applying requires a complete saved review and the exact current local revision.'),row(save,apply)));
    if(preview.result||d.applied)host.append(panel('Continue the original project',note('The native returned-project result is retained. Earlier local and returned histories remain available.'),
      button('Open current saved project',()=>ui.openProject(preview.projectId))));
  }
  return {mount};
}
