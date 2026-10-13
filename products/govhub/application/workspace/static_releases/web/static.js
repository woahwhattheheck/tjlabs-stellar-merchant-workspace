/* Complete static release views in the original GovHub application. */
'use strict';
window.GovHubStaticRelease = (() => {
  const S = {owner:null, sequence:0, data:null, selected:null, pending:null, db:null, timer:null};
  const terminal = new Set([400,409,413,415,422]);
  const owner = () => state.user && state.snapshot?.workspace?.id
    ? state.snapshot.workspace.id + ':' + state.user.name : null;
  const recordName = (kind,id) => (state.snapshot?.entities?.[kind]||[]).find(r=>r.id===id)?.data?.name||id||'—';
  const label = id => S.data?.editions?.find(r=>r.id===id)?.label||id||'No prior edition';
  const fileLink = (id,name='Download original') => id ? '<a href="/api/files/'+enc(id)+'">'+esc(name)+'</a>' : '—';
  const reqButton = (title,action,data={}) => button(title,'static-'+action,data);
  const dates = v => esc(date(v));
  const admin = () => state.user?.role==='admin';
  const reviewer = () => ['reviewer','admin'].includes(state.user?.role);
  const pending = () => S.pending && !['complete','rejected'].includes(S.pending.phase);
  const raw = (name,value) => rawDetails(name,value);
  const links = () => '<div class="static-tabs">'+link('Release workspace','static')+link('Native builds','operations')+link('Original sources','sources')+link('Workspace backup','settings')+'</div>';
  const selectedLink = result => {
    if(result.export)return href('static-export',{id:result.export.id});
    if(result.operation)return href('static-operation',{id:result.operation.id});
    if(result.plan)return href('static-plan',{id:result.plan.id});
    if(result.edition)return href('static-edition',{id:result.edition.id});
    if(result.target)return href('static-target',{id:result.target.target_id});
    if(result.review)return href('static-plan',{id:result.review.plan_id});
    return href('static');
  };

  function database() {
    if(S.db)return S.db;
    S.db=new Promise((resolve,reject)=>{
      const q=indexedDB.open('govhub-static-release-requests-v1',1);
      q.onupgradeneeded=()=>q.result.createObjectStore('requests',{keyPath:'owner'});
      q.onsuccess=()=>resolve(q.result);
      q.onerror=()=>reject(Error('The browser could not retain the original request. Check browser storage before starting this action.'));
    });
    return S.db;
  }
  async function record(write,change) {
    const key=owner();
    const db=await database();
    if(!key)throw Error('Sign in to the original workspace.');
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('requests',write?'readwrite':'readonly'), store=tx.objectStore('requests');
      let result, error;
      const get=store.get(key);
      get.onsuccess=()=>{
        try {
          if(owner()!==key)throw Error('The signed-in workspace changed. Reopen this action under its original account.');
          result=write?change(get.result||null):get.result||null;
          if(result && result.owner!==key)throw Error('This retained action belongs to another workspace or account.');
          if(write){if(result)store.put(result);else store.delete(key);}
        }catch(e){error=e;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result);
      tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Browser request retention failed.'));
    });
  }
  async function retainResult(request,result) {
    S.pending={...request,phase:'complete',result};
    try {
      const stored=await record(true,current=>{
        if(current?.request_key!==request.request_key)return current;
        return {...current,phase:'complete',result};
      });
      if(stored?.request_key===request.request_key)S.pending=stored;
    }catch(e) {
      // The original stable request remains recoverable from the native journal.
      notice('The action completed. Its saved result is available below; browser retention will retry when storage returns.',true);
    }
  }
  async function publish(request) {
    const originalOwner=request.owner, originalHash=location.hash;
    if(owner()!==originalOwner)throw Error('Recover this action under its original workspace and account.');
    let result;
    try { result=await ops(request.action,request.payload); }
    catch(e) {
      if(owner()!==originalOwner)throw e;
      const phase=terminal.has(e.status)?'rejected':'uncertain';
      S.pending={...request,phase,error:e.message,status:e.status||null};
      try { await record(true,current=>current?.request_key===request.request_key?S.pending:current); } catch {}
      await render();
      throw e;
    }
    if(owner()!==originalOwner)return result;
    await retainResult(request,result);
    if(location.hash===originalHash)await go(selectedLink(result).slice(1).split('?')[0],
      Object.fromEntries(new URLSearchParams(selectedLink(result).split('?')[1]||'')));
    else await render();
    notice('The original action and its saved result are retained.');
    return result;
  }
  async function mutate(action,payload) {
    const key=crypto.randomUUID(), bound={...payload,request_key:key,
      static_workspace_id:state.snapshot?.workspace?.id,static_actor:state.user?.name};
    const next={owner:owner(),request_key:key,action,payload:bound,phase:'awaiting',created_at:new Date().toISOString()};
    if(new TextEncoder().encode(JSON.stringify(next)).length>256*1024)throw Error('This action exceeds the browser request limit.');
    S.pending=await record(true,current=>{
      if(current&&!['complete','rejected'].includes(current.phase))throw Error('Recover the original outstanding action shown above before starting another one.');
      return next;
    });
    return publish(S.pending);
  }
  async function recover() {
    const request=await record(false);
    if(!request)throw Error('There is no retained action to recover.');
    S.pending=request;
    try {
      const known=await ops('static.requests.get',{request_key:request.request_key,
        static_workspace_id:request.payload.static_workspace_id,static_actor:request.payload.static_actor});
      await retainResult(request,known.result);
      location.hash=selectedLink(known.result);
      await render();
    }catch(e) {
      if(e.status!==404)throw e;
      await publish(request);
    }
  }
  function requestView() {
    const r=S.pending;
    if(!r)return '';
    if(r.phase==='complete')return '<section class="static-request"><strong>Saved action</strong> <a href="'+esc(selectedLink(r.result))+'">Open saved result</a><details><summary>Original request</summary><code>'+esc(r.request_key)+'</code></details></section>';
    const message=r.phase==='rejected'?'The original request returned a concrete response. Correct the selected input before a new action.':'The original action is retained. Recover its exact result or retry the same request.';
    return '<section class="static-request" role="status"><strong>'+esc(message)+'</strong><p>'+esc(r.error||r.action)+'</p><div class="actions">'+reqButton('Recover original action','recover')+
      (r.phase==='rejected'?reqButton('Close this returned request','clear-request'):'')+'</div>'+raw('Original action identity',{action:r.action,request_key:r.request_key,created_at:r.created_at,status:r.status||null})+'</section>';
  }
  function controls(body,disabled=false) {
    return '<fieldset class="static-controls"'+(pending()||disabled?' disabled':'')+'><legend class="sr-only">Selected operating action</legend>'+body+'</fieldset>';
  }
  function pager(result,view,params) {
    const base={...params,query:state.params.query||'',status:state.params.status||'all'};
    return '<div class="static-pager"><span>'+esc(result.total)+' matching paths</span><div class="actions">'+
      (result.offset?link('Previous',view,{...base,offset:Math.max(0,result.offset-result.limit)}):'')+
      (result.next_offset!==null?link('Next',view,{...base,offset:result.next_offset}):'')+'</div></div>';
  }
  function filters(view,id) {
    return '<form data-form="static-filter" data-view="'+esc(view)+'" data-id="'+esc(id)+'" class="static-filter">'+
      input('Search complete paths','query',state.params.query||'')+
      (view==='static-plan'?select('Change','status',[['all','All paths'],['added','Added'],['removed','Removed'],['changed','Changed'],['unchanged','Unchanged']],state.params.status||'all'):'')+
      '<button>Apply filter</button></form>';
  }
  function editionTable(items) {
    return table(['Complete edition','Native build','Output','Completed'],items.map(e=>[
      link(e.label,'static-edition',{id:e.id}),link(short(e.operation_id),'operation',{id:e.operation_id}),
      esc(e.file_count)+' files · '+esc(size(e.total_bytes)),dates(e.completed_at||e.created_at)]));
  }
  function operationRows(items) {
    return table(['Original operation','State','Target / build','Progress'],items.map(o=>[
      link(o.type+' · '+short(o.id),o.type.startsWith('STATIC_')?'static-operation':'operation',{id:o.id}),
      badge(o.state),esc(recordName('environments',o.environment_id)),esc(o.progress?.detail||'')]));
  }
  function overview() {
    const t=S.data.targets,e=S.data.editions,plans=S.data.plans,builds=S.data.builds||[];
    const completed=builds.filter(o=>o.state==='COMPLETE');
    main.innerHTML=heading('Static releases','Complete Tome output, retained comparisons, and the original local release worker.',
      reqButton('Refresh','refresh'))+links()+requestView()+
      '<div class="static-metrics"><div><strong>'+e.length+'</strong><span>Complete editions</span></div><div><strong>'+t.length+'</strong><span>Configured targets</span></div><div><strong>'+S.data.releases.length+'</strong><span>Retained selections</span></div></div>'+
      '<div class="grid wide"><div>'+card('Release targets',table(['Target','Current edition','Environment','Selected path'],t.map(v=>[
        link(v.label,'static-target',{id:v.target_id}),v.current_release?link(label(v.current_release.edition_id),'static-edition',{id:v.current_release.edition_id}):'No current edition',
        esc(recordName('environments',v.environment_id)),'<code>'+esc(v.release_root)+' / '+esc(v.current_name)+'</code>']))+
        (admin()?'<p>'+link('Configure existing target','static-target-new')+'</p>':''))+
      card('Complete output editions',editionTable(e))+
      card('Saved comparisons',table(['Plan','Target','Changes','Latest review'],plans.map(p=>[
        link(p.label,'static-plan',{id:p.id}),link(t.find(v=>v.target_id===p.target_id)?.label||p.target_id,'static-target',{id:p.target_id}),
        esc(p.counts.added)+' added · '+esc(p.counts.removed)+' removed · '+esc(p.counts.changed)+' changed',
        badge(p.latest_review?.decision||'Not reviewed')])) )+'</div><div>'+
      card('Receive native build output','<p>Select a completed original Tome capture. The complete report, every generated path and original source artifacts stay bound to that build.</p>'+
        '<form data-form="static-receive">'+controls(select('Original completed build','operation_id',[['','Choose a completed build'],...completed.map(o=>[o.id,recordName('environments',o.environment_id)+' · '+short(o.id)])])+
          input('Edition name','label','','text',true)+'<button class="primary">Retain complete edition</button>')+'</form>'+
        '<p>'+link('Configure native Tome profile','records',{kind:'environments'})+' · '+link('Start original native build','operation-new')+'</p>')+
      card('Original build history',operationRows(builds.slice(0,20)))+
      card('Complete handovers',table(['Handover','Captured','Download'],S.data.exports.map(x=>[
        link(x.name,'static-export',{id:x.id}),dates(x.captured_at),fileLink(x.file.id,'Full ZIP')])) )+'</div></div>';
  }
  function targetForm(selected) {
    const old=selected?.target;
    const editions=S.data.editions;
    return heading(old?'Edit target description':'Configure existing static target','Select the original operating environment and one existing local release directory.')+links()+requestView()+
      card('Target configuration','<form data-form="static-target-save">'+controls(
        input('Target name','label',old?.label||'','text',true)+
        (old?definition([['Environment',esc(recordName('environments',old.environment_id))],['Release directory','<code>'+esc(old.release_root)+'</code>'],['Current pointer',esc(old.current_name)]]):
        select('Original environment','environment_id',[['','Choose an existing environment'],...(state.snapshot.entities.environments||[]).filter(v=>!v.archived).map(v=>[v.id,v.data.name])])+
        input('Existing release directory','release_root','','text',true,'Absolute directory already selected on this native host.')+
        input('Current symlink name','current_name','current','text',true)+
        select('Existing output baseline, if current already exists','baseline_edition_id',[['','No current pointer'],...editions.map(e=>[e.id,e.label])],'','An existing current directory must match the complete retained baseline, including all paths and bytes.'))+
        area('Target notes','notes',old?.notes||'')+'<button class="primary">Save configured target</button>')+'</form>');
  }
  function targetView(result,observed) {
    const t=result.target, current=result.current_release;
    const e=S.data.editions.filter(v=>v.environment_id===t.environment_id);
    main.innerHTML=heading(t.label,'Configured local release target',reqButton('Refresh actual pointer','inspect',{id:t.target_id}))+links()+requestView()+
      '<div class="grid wide"><div>'+card('Current selection',definition([
        ['Retained edition',current?link(label(current.edition_id),'static-edition',{id:current.edition_id}):'No current edition'],
        ['Actual current pointer',observed?.error?'Unavailable on this host':'<code>'+esc(observed?.pointer??'No pointer')+'</code>'],
        ['Release directory','<code>'+esc(t.release_root)+'</code>'],['Environment',esc(recordName('environments',t.environment_id))]])+
        (observed?.error?'<p class="callout">'+esc(observed.error)+' The retained source and history remain available. Configure the receiving machine’s own existing target for a new selection.</p>':current&&current.pointer!==observed?.pointer?'<p class="callout">The actual pointer differs from the retained current release. Inspect the original operating history before starting a new selection.</p>':'')+
        '<p>'+esc(t.notes)+'</p>'+raw('Target and current source identity',{target:t,current_release:current,observed})+
        (admin()?'<p>'+(!observed?.error?link('Edit target description','static-target-edit',{id:t.target_id})+' · ':'')+link('Configure another existing target','static-target-new')+'</p>':''))+
      card('Retained release history',table(['Selection','Edition','Operator / time','Reason'],result.releases.slice().reverse().map(r=>[
        r.operation_id?link(r.kind,'static-operation',{id:r.operation_id}):esc(r.kind),
        link(label(r.edition_id),'static-edition',{id:r.edition_id}),esc(r.author)+'<small>'+dates(r.created_at)+'</small>',esc(r.reason)])))+
      card('Exact configured target history',table(['Edition','Saved','Operator'],result.history.slice().reverse().map(r=>[
        '<code>'+esc(short(r.revision))+'</code>',dates(r.created_at),esc(r.author)])))+'</div><div>'+
      card('Compare next edition','<form data-form="static-plan-create">'+controls(
        select('Complete candidate output','candidate_id',[['','Choose complete output'],...e.map(v=>[v.id,v.label])])+
        input('Comparison name','label','','text',true)+area('Purpose / changes to inspect','notes')+
        '<button class="primary">Save complete comparison</button>')+'</form>')+
      (current?.previous_release_id?card('Restore retained predecessor','<p>This selects the exact predecessor of the current retained release through the original worker. All later output remains retained.</p>'+
        '<form data-form="static-rollback">'+controls(area('Reason for rollback','reason','',true)+'<button>Queue original predecessor rollback</button>',Boolean(observed?.error))+'</form>'):'')+
      card('Portable handover','<p>Includes complete generated editions, original native inputs, full comparisons, decisions and release history. The original workspace backup reopens the same live identities.</p>'+
        '<form data-form="static-export-create">'+controls(input('Handover name','name',t.label+' static release','text',true)+'<button>Create complete handover ZIP</button>')+'</form>'+
        '<p>'+link('Create whole workspace backup','settings')+'</p>')+'</div></div>';
  }
  function editionView(result) {
    const e=result.edition;
    main.innerHTML=heading(e.label,'Complete original generated output',link('Original native build','operation',{id:e.operation_id}))+links()+requestView()+
      card('Output source',definition([['Generator',esc(e.generator.package+' '+e.generator.version)],['Production URI',esc(e.production_uri)],
        ['Complete output',esc(e.file_count)+' files · '+esc(size(e.total_bytes))],['Completed',dates(e.completed_at)]])+
        raw('Exact source identities',e)+table(['Original source / outcome','Bytes','Retained download'],e.sources.map(s=>[esc(s.role)+'<small>'+esc(s.filename)+'</small>',esc(size(s.bytes)),fileLink(s.file_id)])))+
      card('Complete output paths',filters('static-edition',e.id)+table(['Original relative path','Bytes','Source SHA-256','Download'],result.files.rows.map(f=>[
        '<code>'+esc(f.path)+'</code>',esc(size(f.bytes)),'<code>'+esc(f.sha256)+'</code>',fileLink(f.file_id,'Exact file')]))+
        pager(result.files,'static-edition',{id:e.id}));
  }
  function planView(result) {
    const p=result.plan,comp=result.comparison,latest=result.reviews.at(-1);
    const rows=comp.rows.map(r=>[
      badge(r.status),'<code>'+esc(r.path)+'</code>',
      r.before?esc(size(r.before.bytes))+'<small>'+fileLink(r.before.file_id,'Before file')+'</small>':'—',
      r.after?esc(size(r.after.bytes))+'<small>'+fileLink(r.after.file_id,'Candidate file')+'</small>':'—']);
    main.innerHTML=heading(p.label,'Retained complete path comparison',link('Target','static-target',{id:p.target_id}))+links()+requestView()+
      (!result.current?'<p class="callout">This comparison retains its original target and predecessor. Create a new comparison from the current target before another publication.</p>':'')+
      '<div class="grid wide"><div>'+card('Selected output pair',definition([
        ['Before',p.baseline_id?link(label(p.baseline_id),'static-edition',{id:p.baseline_id}):'First complete edition'],
        ['Candidate',link(label(p.candidate_id),'static-edition',{id:p.candidate_id})],['Purpose',esc(p.notes)],
        ['Complete comparison',esc(comp.counts.added)+' added · '+esc(comp.counts.removed)+' removed · '+esc(comp.counts.changed)+' changed · '+esc(comp.counts.unchanged)+' unchanged']])+raw('Pinned source and target',p))+
      card('All output paths',filters('static-plan',p.id)+table(['Change','Original path','Before','Candidate'],rows)+pager(comp,'static-plan',{id:p.id}))+'</div><div>'+
      card('Review history',result.reviews.length?'<ol class="timeline">'+result.reviews.map(r=>'<li>'+badge(r.decision)+' · '+esc(r.author)+'<small>'+dates(r.created_at)+'</small><p>'+esc(r.reason)+'</p></li>').join('')+'</ol>':empty('This full comparison has not been reviewed.'))+
      (reviewer()?card('Review this comparison','<form data-form="static-review">'+controls(
        select('Decision','decision',[['APPROVE','Approve this complete comparison'],['RETURN','Return for correction']],latest?.decision||'APPROVE')+
        area('Reason / findings','reason','',true)+'<button>Save retained review</button>')+'</form>'):'')+
      card('Original release worker','<p>Staging preserves the whole candidate output without changing current. Publication selects that staged output after its retained review.</p>'+
        '<form data-form="static-run"><fieldset class="static-controls"'+(pending()||!result.current?' disabled':'')+'><legend class="sr-only">Stage or publish the selected edition</legend>'+
        area('Operating reason','reason','',true)+'<div class="actions"><button name="type" value="STATIC_STAGE">Stage complete edition</button>'+
        (latest?.decision==='APPROVE'&&result.stages.length?'<button name="type" value="STATIC_PUBLISH" class="primary">Publish staged edition</button>':'')+
        '</div></fieldset></form>'+table(['Completed stage','Time','Output'],result.stages.map(v=>[
          link(short(v.operation_id),'static-operation',{id:v.operation_id}),dates(v.completed_at),esc(v.file_count)+' files'])))+'</div></div>';
  }
  function operationView(result) {
    const o=result.operation;
    const live=['QUEUED','RUNNING'].includes(o.state), control=!['COMPLETE','CANCELLED'].includes(o.state);
    main.innerHTML=heading(o.type.replaceAll('_',' ')+' · '+short(o.id),'Original native operation and exact retained result',reqButton('Refresh status','refresh'))+links()+requestView()+
      '<div class="grid wide"><div>'+card('Operating state',badge(o.state,['FAILED','WAITING_NATIVE'].includes(o.state))+
        '<p id="static-progress">'+esc(o.progress?.detail||'')+'</p>'+definition([
          ['Target',link(o.static_target?.label||o.static_target_id,'static-target',{id:o.static_target_id})],
          ['Complete edition',link(o.static_edition?.label||o.static_edition?.id,'static-edition',{id:o.static_edition?.id})],
          ['Original comparison',o.static_plan?link(o.static_plan.label,'static-plan',{id:o.static_plan.id}):'Retained predecessor rollback'],
          ['Operator',esc(o.author)],['Started',dates(o.actual_started_at)],['Finished',dates(o.actual_finished_at)]])+
        (o.error?'<p class="callout">'+esc(typeof o.error==='object'?o.error.message:o.error)+'</p>':'')+
        raw('Original operating input and native outcome',o))+
      card('Retained sequence','<ol class="timeline">'+result.events.map(e=>'<li><strong>'+esc(e.event)+'</strong><small>'+dates(e.created_at)+' · '+esc(e.author)+'</small><p>'+esc(e.details?.detail||e.details?.message||'')+'</p></li>').join('')+'</ol>')+'</div><div>'+
      card('Original files',table(['File','Bytes','Download'],(result.files||[]).map(f=>[esc(f.name||f.filename),esc(size(f.size??f.bytes)),fileLink(f.file_id||f.id,'Exact retained file')])) )+
      ((control||o.state==='CANCELLED')?card('Continue original operation','<p>Keep this original operation and its retained checkpoint. An attempted publication is reconciled against its actual pointer before another change.</p>'+
        '<form data-form="static-operation-control">'+controls(area('Operating reason','reason','',true)+'<div class="actions">'+
        (control?'<button name="control" value="cancel">Cancel remaining work</button>':'')+
        (!live?'<button name="control" value="resume">Resume original operation</button>':'')+'</div>')+'</form>'):'')+
      (o.state==='COMPLETE'?card('Continue release workflow','<p>'+link('Open current target','static-target',{id:o.static_target_id})+'</p>'+
        (o.static_plan?'<p>'+link('Open complete comparison and publish controls','static-plan',{id:o.static_plan.id})+'</p>':'')):'')+'</div></div>';
  }
  function exportView(result) {
    const e=result.export;
    main.innerHTML=heading(e.name,'Complete retained output and operating handover')+links()+requestView()+
      card('Download complete handover','<p>'+fileLink(e.file.id,'Download Static_Release_Handover.zip')+' · '+esc(size(e.file.bytes))+'</p>'+
      definition([['Complete editions',esc(e.edition_count)],['Retained selections',esc(e.release_count)],['Captured',dates(e.captured_at)]])+
      raw('Exact handover identity',e)+'<p>'+link('Return to selected target','static-target',{id:e.target_id})+' · '+link('Original workspace backup','settings')+'</p>');
  }
  async function render() {
    clearTimeout(S.timer);
    const seq=++S.sequence, key=owner(), routeAt=location.hash;
    if(!key)return;
    if(S.owner!==key){S.owner=key;S.pending=null;S.selected=null;}
    const stored=await record(false);
    if(owner()!==key||seq!==S.sequence)return;
    if(!(S.pending?.phase==='complete'&&S.pending.request_key===stored?.request_key&&stored.phase!=='complete'))S.pending=stored;
    const data=await ops('static.list');
    if(owner()!==key||seq!==S.sequence||location.hash!==routeAt)return;
    S.data=data;
    const params={offset:Number(state.params.offset||0),limit:100,query:state.params.query||'',status:state.params.status||'all'};
    let result,observed;
    if(state.view==='static-edition')result=await ops('static.editions.get',{...params,edition_id:state.params.id});
    else if(state.view==='static-plan')result=await ops('static.plans.get',{...params,plan_id:state.params.id});
    else if(['static-target','static-target-edit'].includes(state.view)) {
      result=await ops('static.targets.get',{target_id:state.params.id});
      if(state.view==='static-target') {
        try { observed=(await ops('static.targets.inspect',{target_id:state.params.id})).observed; }
        catch(e) { if([401,403].includes(e.status))throw e; observed={error:e.message,status:e.status||null}; }
      }
    } else if(state.view==='static-operation')result=await ops('operations.get',{operation_id:state.params.id});
    else if(state.view==='static-export')result=await ops('static.exports.get',{export_id:state.params.id});
    if(owner()!==key||seq!==S.sequence||location.hash!==routeAt)return;
    S.selected=result;
    if(state.view==='static-edition')editionView(result);
    else if(state.view==='static-plan')planView(result);
    else if(state.view==='static-target')targetView(result,observed);
    else if(['static-target-new','static-target-edit'].includes(state.view))main.innerHTML=targetForm(result);
    else if(state.view==='static-operation') {
      operationView(result);
      if(['QUEUED','RUNNING'].includes(result.operation.state))scheduleStatus(result.operation.id,key);
    } else if(state.view==='static-export')exportView(result);
    else overview();
  }
  function scheduleStatus(id,key) {
    S.timer=setTimeout(async()=>{
      if(owner()!==key||state.view!=='static-operation'||state.params.id!==id||state.busy)return;
      try {
        const result=await ops('operations.get',{operation_id:id});
        if(owner()!==key||state.view!=='static-operation'||state.params.id!==id)return;
        const before=S.selected.operation;
        S.selected=result;
        const text=main.querySelector('#static-progress');
        if(text)text.textContent=result.operation.progress?.detail||'';
        if(result.operation.state!==before.state)await render();
        else scheduleStatus(id,key);
      }catch(e){notice(e.message,true);}
    },5000);
  }
  async function submit(form,submitter) {
    const v=values(form),kind=form.dataset.form;
    if(kind==='static-filter'){await go(form.dataset.view,{id:form.dataset.id,query:v.query,status:v.status||'all'});return;}
    if(kind==='static-receive') {
      const build=(S.data.builds||[]).find(o=>o.id===v.operation_id);
      if(!build)throw Error('Choose the original completed Tome build.');
      await mutate('static.editions.receive',{operation_id:build.id,expected_revision:build.revision,label:v.label});return;
    }
    if(kind==='static-target-save') {
      const old=S.selected?.target;
      await mutate('static.targets.save',{...v,...(old?{target_id:old.target_id,expected_revision:old.revision}:{}),
        ...(!v.baseline_edition_id?{baseline_edition_id:undefined}:{})});return;
    }
    if(kind==='static-plan-create') {
      const t=S.selected.target;
      await mutate('static.plans.create',{...v,target_id:t.target_id,expected_revision:t.revision,
        expected_current_release_id:S.selected.current_release?.id||null});return;
    }
    if(kind==='static-review') {
      const p=S.selected.plan;
      await mutate('static.reviews.save',{...v,plan_id:p.id,comparison_sha256:p.comparison_sha256});return;
    }
    if(kind==='static-run') {
      const p=S.selected.plan,t=S.selected.target;
      const type=submitter?.value;
      if(!['STATIC_STAGE','STATIC_PUBLISH'].includes(type))throw Error('Choose Stage or Publish.');
      await mutate('static.operations.create',{type,plan_id:p.id,target_id:t.target_id,
        expected_revision:t.revision,expected_current_release_id:S.selected.current_release?.id||null,reason:v.reason});return;
    }
    if(kind==='static-rollback') {
      const t=S.selected.target;
      await mutate('static.operations.create',{type:'STATIC_ROLLBACK',target_id:t.target_id,
        expected_revision:t.revision,expected_current_release_id:S.selected.current_release?.id||null,reason:v.reason});return;
    }
    if(kind==='static-export-create') {
      const t=S.selected.target;
      await mutate('static.exports.create',{...v,target_id:t.target_id,expected_revision:t.revision});return;
    }
    if(kind==='static-operation-control') {
      const o=S.selected.operation,control=submitter?.value;
      if(!['cancel','resume'].includes(control))throw Error('Choose the original operation control.');
      await mutate('operations.'+control,{operation_id:o.id,expected_revision:o.revision,reason:v.reason});return;
    }
  }
  async function action(name,element) {
    if(name==='static-recover'){await recover();return;}
    if(name==='static-clear-request') {
      S.pending=await record(true,current=>{
        if(current&&!['complete','rejected'].includes(current.phase))throw Error('The original action is still unresolved; recover it before clearing.');
        return null;
      });
      await render();return;
    }
    if(name==='static-refresh'||name==='static-inspect'){await reload();await render();return;}
  }
  return {render,submit,action};
})();
