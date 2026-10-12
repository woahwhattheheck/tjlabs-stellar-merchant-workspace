// MIT. Original complete collection comparisons, reviews and customer receiving.
export function createComparisonView({root,api,esc,table,notify}) {
  let service=null,identity=null,generation=0,busy=false,collections=[],inventory=[],opened=null;
  let rows=[],rowOffset=0,nextOffset=null,rowKind='cells',rowStatus='',pendingReview=null,pendingCreate=null;
  const node=id=>root.querySelector('#comparison-'+id),query=value=>new URLSearchParams(value).toString();
  const text=value=>value===null?'<span class="muted">NULL</span>':esc(typeof value==='object'?JSON.stringify(value):value);
  const stamp=side=>side.rows+' rows · '+side.pageCount+' pages · '+side.collectionSha256.slice(0,16);
  const storageKey=kind=>'odata-live-comparison:'+identity+':'+kind;
  function remembered(kind){try{const raw=sessionStorage.getItem(storageKey(kind));return raw?JSON.parse(raw):null;}catch{return null;}}
  function remember(kind,value){
    try{if(value===null)sessionStorage.removeItem(storageKey(kind));else sessionStorage.setItem(storageKey(kind),JSON.stringify(value));}
    catch{throw new Error('This browser could not retain the original pending request. Free session storage before saving.');}
  }
  function requireService(){if(!service)throw new Error('Open the original prepared live service first.');return service.id;}
  function setBusy(value){
    busy=value;root.setAttribute('aria-busy',String(value));
    for(const control of root.querySelectorAll('button,input,select,textarea'))control.disabled=value;
    if(!value){
      node('previous').disabled=!opened||rowOffset===0;node('next').disabled=!opened||nextOffset===null;
      node('publish').disabled=!opened;node('retry-review').disabled=!pendingReview||!opened;
      node('retry-create').disabled=!pendingCreate;
      scopeControls();
    }
  }
  async function run(label,operation){
    if(busy)return;const token=generation;setBusy(true);notify(label+'…');
    try{await operation(token);if(token===generation)notify(label+' completed.');}
    catch(error){notify(error.message,true);}finally{setBusy(false);}
  }
  function link(path,label=path){
    return '<a download href="/api/live/file?'+esc(query({id:service.id,kind:'comparison',recordId:opened.id,name:path}))+'">'+esc(label)+'</a>';
  }
  function pendingDisplay(){
    node('pending-create').textContent=pendingCreate?'Retained create request: '+pendingCreate.comparisonId+'. Retry continues this exact original selection.':'';
    node('pending-review').textContent=pendingReview?'Retained review request: '+pendingReview.requestId+'. Retry first checks the original saved history.':'';
  }
  function scopeControls(){
    const scope=node('review-scope').value;
    node('review-key').disabled=busy||!['entity','cell'].includes(scope);
    node('review-field').disabled=busy||!['column','cell'].includes(scope);
  }
  function selectedCollections(){
    const before=collections.find(value=>value.id===node('before').value),after=collections.find(value=>value.id===node('after').value);
    node('pair-summary').textContent=before&&after
      ?'Before: '+before.rows+' rows, '+before.pageCount+' pages. After: '+after.rows+' rows, '+after.pageCount+' pages. The complete original keys, queries and acquisition windows remain attached.'
      :'Receive and open two complete original collections to choose the before and after sources.';
    return {before,after};
  }
  function drawCollections(){
    for(const id of ['before','after']){
      const control=node(id),previous=control.value;
      control.innerHTML=collections.filter(value=>value.status==='READY').map(value=>'<option value="'+esc(value.id)+'">'+esc(value.title||value.id)+' · '+esc(value.rows)+' rows · '+esc(value.id)+'</option>').join('');
      if(collections.some(value=>value.id===previous&&value.status==='READY'))control.value=previous;
    }
    selectedCollections();
  }
  function drawInventory(){
    node('inventory').innerHTML=table(['Comparison','State','Before / after rows','Changed cells','Saved review','Open'],inventory.map(value=>[
      esc(value.title||value.selection?.title||value.id),esc(value.status),
      value.counts?esc(value.counts.beforeRows+' / '+value.counts.afterRows):'',
      esc(value.counts?.changedCells??''),esc(value.reviewRevision??''),
      value.status==='COMPLETE'?'<button type="button" class="small" data-comparison-open="'+esc(value.id)+'">Open</button>':
        value.selection&&value.sourceCollections?.before&&value.sourceCollections?.after
          ?'<button type="button" class="small" data-comparison-resume="'+esc(value.id)+'">Resume original selection</button>'
          :'Continue the retained original create or restore request'
    ]));
  }
  async function refresh(token=generation){
    const id=requireService(),[selected,comparisons]=await Promise.all([
      api('/api/live/collections?'+query({id})),api('/api/live/comparisons?'+query({id}))]);
    if(token!==generation)return;collections=selected;inventory=comparisons;drawCollections();drawInventory();
  }
  function drawReviews(){
    const review=opened?.reviews;
    node('review-revision').textContent=review?'Saved revision '+review.revision:'Open a completed comparison';
    node('publish').textContent=review?'Publish saved revision '+review.revision:'Publish saved review';
    node('reviews').innerHTML=review?table(['Version','Scope','Entity / field','Decision','Reviewer','Note','Saved'],review.history.slice(-100).reverse().map(value=>[
      esc(value.version),esc(value.scope),'<code>'+esc([value.entityKey,value.field].filter(Boolean).join(' · '))+'</code>',
      esc(value.status),esc(value.actor),esc(value.note),esc(value.savedAt)
    ])):'';
    node('review-history-note').innerHTML=review?'Showing the latest '+Math.min(100,review.history.length)+' of '+review.history.length+
      ' saved versions. '+link('reviews.json','Download the complete original review history'):'';
  }
  function drawOpened(){
    const value=opened,selected=value.selection,c=value.counts;
    node('detail').innerHTML='<h3>'+esc(selected.title)+'</h3><div class="metric-row">'+
      [['Matched entities',c.matched],['Before only',c.beforeOnly],['After only',c.afterOnly],['Changed entities',c.changedEntities],['Changed cells',c.changedCells]]
        .map(([label,number])=>'<div class="metric"><b>'+esc(number)+'</b><span>'+esc(label.toUpperCase())+'</span></div>').join('')+'</div>'+
      '<p>'+esc(selected.presenceMeaning)+'</p><p class="muted">'+esc(selected.acquisitionMeaning)+'</p>'+
      '<div class="table-wrap">'+table(['Source','Complete collection','Query / fields','Acquired','Provider counts'],['before','after'].map(side=>{
        const source=selected[side];return [esc(side),esc(stamp(source)),
          esc(source.queryFingerprint.slice(0,20))+'<br>'+esc((source.query.select||[]).join(', ')),
          esc(source.acquisition.firstReceivedAt)+'<br>'+esc(source.acquisition.lastReceivedAt),
          esc(source.reportedCounts.length?source.reportedCounts.join(', '):'Not supplied')+(source.countConsistent?'':' · varied during acquisition')];
      }))+'</div><p>'+esc(selected.sameQuery?'The selected query is unchanged.':'The original queries differ; presence changes remain scoped to each selection.')+' '+
      esc(selected.sameProjection?'The delivered projection is unchanged.':'The delivered projection or source declaration differs; selection and declaration changes remain distinct.')+'</p>'+
      '<details><summary>Original keys and field declarations</summary><div class="table-wrap">'+
      table(['Field','Before type','After type','Key','Declaration'],selected.fields.map(field=>[
        esc(field.path),esc(field.before?.odataType||'Field not selected'),esc(field.after?.odataType||'Field not selected'),
        selected.keyFields.includes(field.path)?'Declared key':'',field.declarationChanged?'Changed':''
      ]))+'</div><pre>'+esc(JSON.stringify({comparisonSha256:value.manifestSha256,before:selected.before,after:selected.after},null,2))+'</pre></details>';
    const previous=node('review-field').value;
    node('review-field').innerHTML=selected.fields.map(field=>'<option value="'+esc(field.path)+'">'+esc(field.path)+'</option>').join('');
    if(selected.fields.some(field=>field.path===previous))node('review-field').value=previous;
    node('files').innerHTML=table(['Retained file','Bytes','SHA-256'],value.retainedFiles.map(file=>[
      link(file.path),esc(file.bytes),'<code>'+esc(file.sha256)+'</code>'
    ]));
    node('analysis-summary').textContent='Initial analytical source contains review revision '+value.analysis.reviewRevision+
      '. Publish the current saved revision to retain its own complete analytical edition. Every source.json must travel with its declared files.';
    drawReviews();pendingDisplay();
  }
  function drawRows(result){
    rows=result.rows;rowOffset=result.offset;nextOffset=result.nextOffset;
    if(rowKind==='cells'){
      const cell=value=>'<b>'+esc(value.state)+'</b>'+('value'in value?'<br>'+text(value.value):'')+
        (value.type?'<br><span class="muted">'+esc(value.type)+'</span>':'');
      node('rows').innerHTML=table(['Entity','Field / change','Before','After','Typed equality','Original rows','Review'],rows.map((value,index)=>[
        '<code>'+esc(value.entityKey)+'</code>',esc(value.field)+'<br>'+esc(value.change),
        cell(value.before),cell(value.after),value.typedEqual===null?'Unknown':value.typedEqual?'Equal':'Different',
        esc((value.beforeRow??'Absent')+' / '+(value.afterRow??'Absent')),
        '<button type="button" class="small" data-comparison-cell="'+index+'">Review cell</button>'
      ]));
    }else node('rows').innerHTML=table(['Entity','Presence / change','Original before row','Original after row','Changed fields','Review'],rows.map((value,index)=>[
      '<code>'+esc(value.entityKey)+'</code>',esc(value.status),esc(value.beforeRow??'Absent'),esc(value.afterRow??'Absent'),
      esc(value.changedFields.join(', ')),'<button type="button" class="small" data-comparison-entity="'+index+'">Review entity</button>'
    ]));
    node('row-range').textContent=result.rows.length?(result.offset+1)+'–'+(result.offset+result.rows.length)+' of '+result.total:'0 selected rows';
  }
  async function showRows(offset,token=generation){
    if(!opened)return;const chosen=opened,kind=rowKind,status=rowStatus;
    const result=await api('/api/live/comparison/rows?'+query({id:requireService(),comparisonId:chosen.id,kind,offset,limit:100,...(status?{status}:{})}));
    if(token!==generation||opened!==chosen||kind!==rowKind||status!==rowStatus)return;
    if(result.comparisonSha256!==chosen.manifestSha256)throw new Error('The selected comparison changed. Open its original identity again.');
    drawRows(result);
  }
  async function openComparison(id,token=generation){
    const result=await api('/api/live/comparison?'+query({id:requireService(),comparisonId:id}));
    if(token!==generation)return;opened=result;
    pendingReview=remembered('review:'+id);
    if(pendingReview&&pendingReview.comparisonSha256!==result.manifestSha256)throw new Error('The retained browser request selects another comparison identity.');
    drawOpened();await showRows(0,token);
  }
  async function create(input,token){
    remember('create',input);
    const value=await api('/api/live/comparison',input);
    if(token!==generation)return;
    pendingCreate=null;remember('create',null);pendingDisplay();await refresh(token);await openComparison(value.id,token);
  }
  function reviewBody(data){
    const scope=String(data.get('scope')),usesKey=['entity','cell'].includes(scope),usesField=['column','cell'].includes(scope);
    return {requestId:crypto.randomUUID(),expectedRevision:opened.reviews.revision,scope,
      entityKey:usesKey?String(data.get('entityKey')||''):null,field:usesField?String(data.get('field')||''):null,
      status:String(data.get('status')),actor:String(data.get('actor')||'').trim(),note:String(data.get('note')||'').trim()};
  }
  const equalReview=(saved,body)=>['requestId','scope','entityKey','field','status','actor','note'].every(key=>saved[key]===body[key]);
  async function saveReview(pending,token,{retry=false}={}){
    if(!opened||pending.comparisonSha256!==opened.manifestSha256)throw new Error('Open the original comparison selected by this review.');
    const chosen=opened,id=chosen.id,body={...pending.body};
    if(retry){
      const current=await api('/api/live/comparison?'+query({id:requireService(),comparisonId:id}));
      if(token!==generation)return;
      if(current.manifestSha256!==pending.comparisonSha256)throw new Error('The retained comparison identity changed.');
      const previous=current.reviews.history.find(value=>value.requestId===body.requestId);
      if(previous){
        if(!equalReview(previous,body))throw new Error('The saved request ID belongs to different review content.');
        pendingReview=null;remember('review:'+id,null);opened=current;drawOpened();return;
      }
      // The explicit retry keeps the exact original decision and advances only
      // its concurrency precondition after reading the actual current history.
      body.expectedRevision=current.reviews.revision;
      pendingReview={...pending,body};remember('review:'+id,pendingReview);
    }
    await api('/api/live/comparison/review',{id:requireService(),comparisonId:id,...body});
    if(token!==generation)return;
    pendingReview=null;remember('review:'+id,null);await openComparison(id,token);await refresh(token);
  }
  root.innerHTML='<div class="panel"><div class="section-heading"><div><h3>Compare complete live collections</h3><p id="comparison-service">Open a prepared live service</p></div><button id="comparison-refresh" type="button">Open comparisons and sources</button></div>'+
    '<p>Join original declared entity keys across two complete customer collections. Inspect exact source changes, save review decisions, and transfer a complete analytical edition with both original inputs.</p><div id="comparison-inventory" class="table-wrap"></div></div>'+
    '<form id="comparison-create" class="panel"><h3>Select the original pair</h3><div class="form-grid">'+
    '<label>Before collection<select id="comparison-before" name="before" required></select></label><label>After collection<select id="comparison-after" name="after" required></select></label>'+
    '<p id="comparison-pair-summary" class="wide muted"></p>'+
    '<label>Comparison ID<input name="comparisonId" required maxlength="128" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]*" placeholder="orders-review-october"></label>'+
    '<label>Comparison title<input name="title" required maxlength="160" placeholder="Customer Orders review"></label>'+
    '<label class="wide">Fields <span class="muted">Optional, comma-separated; every declared key is retained</span><input name="fields" placeholder="All delivered fields from both sources"></label>'+
    '<div class="wide"><button type="submit" class="primary">Create complete comparison</button></div></div>'+
    '<p id="comparison-pending-create" class="muted"></p><button id="comparison-retry-create" type="button">Retry retained selection</button></form>'+
    '<div id="comparison-detail" class="panel"><p>Open a completed comparison to inspect its sources.</p></div>'+
    '<div class="panel"><div class="section-heading"><h3>Original comparison rows</h3><div class="toolbar">'+
    '<button id="comparison-previous" type="button">Previous 100</button><span id="comparison-row-range"></span><button id="comparison-next" type="button">Next 100</button></div></div>'+
    '<div class="form-grid"><label>Rows<select id="comparison-kind"><option value="cells">Changed cells</option><option value="entities">All joined entities</option></select></label>'+
    '<label>Entity status<select id="comparison-status"><option value="">Every status</option><option value="changed">Changed</option><option value="unchanged">Unchanged</option><option value="before_only">Before only</option><option value="after_only">After only</option></select></label></div><div id="comparison-rows" class="table-wrap"></div></div>'+
    '<form id="comparison-review" class="panel"><div class="section-heading"><h3>Review the selected customer scope</h3><span id="comparison-review-revision"></span></div>'+
    '<p>Choose a row above for an entity or cell review. Excluded labels retain the original rows and values in the complete comparison.</p><div class="form-grid">'+
    '<label>Scope<select id="comparison-review-scope" name="scope"><option value="comparison">Whole comparison</option><option value="entity">Entity</option><option value="column">Field</option><option value="cell">Cell</option></select></label>'+
    '<label>Decision<select name="status"><option value="note">Note</option><option value="accepted">Accepted</option><option value="investigate">Investigate</option><option value="excluded">Excluded from this review</option></select></label>'+
    '<label class="wide">Original entity key<input id="comparison-review-key" name="entityKey" readonly></label>'+
    '<label>Original field<select id="comparison-review-field" name="field"></select></label><label>Reviewer<input name="actor" required maxlength="160" autocomplete="name"></label>'+
    '<label class="wide">Review note<textarea name="note" required maxlength="8000" rows="4"></textarea></label><div class="wide"><button type="submit">Save review decision</button></div></div>'+
    '<p id="comparison-pending-review" class="muted"></p><button id="comparison-retry-review" type="button">Retry the retained note against the current review</button></form>'+
    '<div class="panel"><h3>Saved review history</h3><p id="comparison-review-history-note"></p><div id="comparison-reviews" class="table-wrap"></div></div>'+
    '<div class="panel"><div class="section-heading"><h3>Complete analytical editions and original files</h3><button id="comparison-publish" type="button">Publish saved review</button></div>'+
    '<p id="comparison-analysis-summary"></p><p><a href="/api/backup" download="odata-workspace.json">Download complete OData workspace</a> includes every original collection, comparison, saved note and published analytical edition. Use the existing Restore workspace control to reopen it. Transfers above 64 MiB use its original native file command.</p>'+
    '<div id="comparison-files" class="table-wrap"></div></div>';
  node('before').onchange=selectedCollections;node('after').onchange=selectedCollections;
  node('refresh').onclick=()=>run('Open original comparisons and collections',refresh);
  node('create').onsubmit=event=>{
    event.preventDefault();const data=new FormData(event.target),{before,after}=selectedCollections();
    const fields=String(data.get('fields')||'').trim(),input={id:service?.id,comparisonId:String(data.get('comparisonId')||''),
      beforeCollectionId:before?.id,afterCollectionId:after?.id,expectedBeforeSha256:before?.manifestSha256,
      expectedAfterSha256:after?.manifestSha256,title:String(data.get('title')||'').trim(),...(fields?{fields:fields.split(',').map(value=>value.trim()).filter(Boolean)}:{})};
    void run('Create complete collection comparison',async token=>{
      requireService();if(!before||!after)throw new Error('Select both completed original collections.');
      if(pendingCreate&&JSON.stringify(pendingCreate)!==JSON.stringify(input)){
        if(pendingCreate.comparisonId===input.comparisonId)throw new Error('That ID retains its original request. Retry it, or choose a new comparison ID for the revised selection.');
        remember('create:'+pendingCreate.comparisonId,pendingCreate);
      }
      pendingCreate=input;remember('create',input);pendingDisplay();await create(input,token);
    });
  };
  node('retry-create').onclick=()=>run('Continue the original selected comparison',token=>{
    if(!pendingCreate)throw new Error('No retained create request is selected.');return create(pendingCreate,token);
  });
  node('inventory').onclick=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.comparisonOpen)void run('Open original comparison',token=>openComparison(button.dataset.comparisonOpen,token));
    if(button.dataset.comparisonResume)void run('Resume original comparison',async token=>{
      const value=inventory.find(row=>row.id===button.dataset.comparisonResume);
      if(!value?.selection)throw new Error('The original incomplete selection is unavailable.');
      const input={id:requireService(),comparisonId:value.id,beforeCollectionId:value.sourceCollections.before,afterCollectionId:value.sourceCollections.after,
        expectedBeforeSha256:value.beforeSha256,expectedAfterSha256:value.afterSha256,title:value.selection.title,
        fields:value.selection.fields.map(field=>field.path),limits:value.selection.limits};
      if(pendingCreate&&pendingCreate.comparisonId!==input.comparisonId)throw new Error('Continue the other retained original selection first.');
      pendingCreate=input;remember('create',input);pendingDisplay();await create(input,token);
    });
  };
  for(const name of ['kind','status'])node(name).onchange=()=>run('Open selected comparison rows',token=>{
    rowKind=node('kind').value;rowStatus=node('status').value;return showRows(0,token);
  });
  node('previous').onclick=()=>run('Open previous original rows',token=>showRows(Math.max(0,rowOffset-100),token));
  node('next').onclick=()=>run('Open next original rows',token=>showRows(nextOffset,token));
  node('rows').onclick=event=>{
    if(busy)return;const button=event.target.closest('button');if(!button)return;
    const cell=button.dataset.comparisonCell,entity=button.dataset.comparisonEntity;
    const selected=rows[Number(cell??entity)];if(!selected)return;
    node('review-key').value=selected.entityKey;node('review-scope').value=cell!==undefined?'cell':'entity';
    if(cell!==undefined)node('review-field').value=selected.field;scopeControls();node('review').scrollIntoView({block:'nearest'});
  };
  node('review-scope').onchange=scopeControls;
  node('review').onsubmit=event=>{
    event.preventDefault();if(!opened){notify('Open the completed original comparison first.',true);return;}
    const data=new FormData(event.target),body=reviewBody(data),selected={comparisonSha256:opened.manifestSha256,body,requestId:body.requestId};
    void run('Save original review decision',async token=>{
      if(pendingReview)throw new Error('Reconcile the retained review request before starting another note.');
      if(!body.actor||!body.note)throw new Error('Provide the reviewer and a substantive note.');
      if(['entity','cell'].includes(body.scope)&&!body.entityKey)throw new Error('Select the original entity or cell row first.');
      pendingReview=selected;remember('review:'+opened.id,selected);pendingDisplay();await saveReview(selected,token);
    });
  };
  node('retry-review').onclick=()=>run('Continue the original review decision',token=>{
    if(!pendingReview)throw new Error('No original review request is retained.');return saveReview(pendingReview,token,{retry:true});
  });
  node('publish').onclick=()=>run('Publish the complete saved analytical edition',async token=>{
    if(!opened)throw new Error('Open a completed comparison first.');
    const id=opened.id;await api('/api/live/comparison/publish',{id:requireService(),comparisonId:id,expectedRevision:opened.reviews.revision});
    if(token!==generation)return;await openComparison(id,token);await refresh(token);
  });
  function setService(value){
    const next=value?value.id+':'+value.sourceBinding:null;
    if(next!==identity){
      generation++;identity=next;service=value;opened=null;collections=[];inventory=[];rows=[];rowOffset=0;nextOffset=null;pendingReview=null;
      pendingCreate=value?remembered('create'):null;
      node('detail').innerHTML='<p>Open a completed comparison to inspect its original sources.</p>';
      for(const name of ['rows','files','reviews','review-history-note'])node(name).innerHTML='';
      node('row-range').textContent='';node('analysis-summary').textContent='';node('review-key').value='';
      drawCollections();drawInventory();drawReviews();pendingDisplay();
    }else service=value;
    node('service').textContent=value?value.name+' · '+value.id:'Open a prepared live service';
    if(!busy)setBusy(false);
  }
  setService(null);
  return {setService,refresh:()=>run('Open original comparisons and collections',refresh)};
}
