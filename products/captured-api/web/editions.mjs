// MIT. Complete installed/incoming edition review in the original handover browser.
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>JSON.stringify(value,(_,row)=>row&&typeof row==='object'&&!Array.isArray(row)
  ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=String(text);if(cls)value.className=cls;return value;};
const same=(a,b)=>canonical(a)===canonical(b);
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(value=>value.toString(16).padStart(2,'0')).join('');
const definite=row=>row.error?.status>=400&&row.error.status<500&&!row.error.outcomeUnknown;
const SAVE_PATHS=['draft/save','draft/merge-save','draft/receiving-save'];
const UUID=()=>crypto.randomUUID();

export function createCapturedHandoverEditions(hooks) {
  const {root,context,api,act,retain,local,forget,pendingRows,notice}=hooks;
  const prefix='editions:'+context().tab+':';
  let draftId,state,result,pageData,view='routes',selectedName,offset=0,baselineOffset=0,review,saveButton,reviewStatus;
  function button(text,work,locked=false) {
    const value=node('button',text);value.type='button';value.dataset.locked=String(locked);
    value.disabled=context().busy||locked;value.addEventListener('click',()=>act(work));return value;
  }
  function details(text,value) {
    const selected=node('details'),label=node('summary',text);selected.append(label);
    selected.addEventListener('toggle',()=>{if(selected.open&&selected.childElementCount===1)
      selected.append(node('pre',JSON.stringify(value,null,2)));});return selected;
  }
  function table(headers) {
    const value=node('table'),head=node('thead'),line=node('tr'),body=node('tbody');
    for(const text of headers)line.append(node('th',text));head.append(line);value.append(head,body);
    return {value,body};
  }
  function persist() {if(state)local(prefix+draftId,state);}
  function selectedEditor() {
    const current=context();
    if(!current.editor||current.editor.kind!=='RECEIVING')throw new Error('Open an original receiving draft.');
    return current;
  }
  function refresh() {
    const selected=context().editor;
    root.hidden=selected?.kind!=='RECEIVING';if(root.hidden)return;
    if(draftId!==selected.id) {
      draftId=selected.id;state=local(prefix+draftId)??{draftId,baselines:{},jobs:[],selectedJob:null};
      result=null;pageData=null;review=state.review??null;selectedName=undefined;baselineOffset=0;offset=0;
    }
    render();
  }
  async function observeJob(job) {
    if(job.command!=='COMPARE'||!job.selected?.draftId)return;
    const key=prefix+job.selected.draftId;
    const retained=local(key)??{draftId:job.selected.draftId,baselines:{},jobs:[],selectedJob:null};
    retained.jobs=retained.jobs.filter(row=>row.id!==job.id);
    retained.jobs.unshift({id:job.id,revision:job.selected.revision,state:job.state,createdAt:job.createdAt,
      comparisonSha256:job.result?.comparisonSha256??null});
    retained.selectedJob=job.id;local(key,retained);
    if(context().editor?.id!==job.selected.draftId)return;
    if(draftId!==job.selected.draftId)refresh();
    const changed=result?.id!==job.id;
    state=retained;result=job.state==='COMPLETE'?job.result:null;
    if(changed){pageData=null;selectedName=result?.packages[0]?.name;offset=0;}
    render();
  }
  async function compare() {
    const selected=selectedEditor();
    if(selected.editorMode!=='WORKING'||!same(selected.form,selected.editor.edition.form))
      throw new Error('Save this complete receiving draft before comparing its installed and incoming editions.');
    state.review=null;review=null;persist();
    await hooks.startCommand('COMPARE',{draftId:selected.editor.id,revision:selected.editor.revision,
      baselines:clone(state.baselines)});
    await hooks.refreshLibrary();
  }
  async function loadPage() {
    if(!result)throw new Error('Open a completed incoming-edition comparison.');
    if(!selectedName){pageData=null;render();return;}
    pageData=await api('edition?'+new URLSearchParams({id:result.id,name:selectedName,view,offset,limit:25,
      expectedComparisonSha256:result.comparisonSha256}));
    render();
  }
  function decisionCurrent() {
    const selected=context();
    return review&&selected.editor?.id===review.request.id&&selected.editorMode==='WORKING'&&
      selected.editor.revision===review.request.expectedRevision&&same(selected.form,review.request.form)&&
      result?.id===review.request.comparisonId&&result.comparisonSha256===review.request.comparisonSha256;
  }
  async function reviewNames() {
    const selected=selectedEditor();
    if(selected.editorMode!=='WORKING'||!result)throw new Error('Open the working form and a completed comparison.');
    const request={id:selected.editor.id,expectedRevision:selected.editor.revision,
      comparisonId:result.id,comparisonSha256:result.comparisonSha256,form:clone(selected.form)};
    state.review={request};persist();
    const native=await api('draft/receiving-review',request);
    review={request,native};state.review=review;persist();render();
    notice(native.state==='READY'?'The complete incoming-edition receiving decision is ready to save.':
      'Choose available receiving names for the displayed immutable-package conflicts.');
  }
  async function acceptSaved(saved,request,{foreground=false}={}) {
    // Retain completion before changing an editor or removing its original pending request.
    local(prefix+'save:'+request.requestId,{saved,request});
    const selected=local(prefix+saved.id)??{draftId:saved.id,baselines:{},jobs:[],selectedJob:request.comparisonId};
    selected.saved={id:saved.id,revision:saved.revision,requestId:request.requestId,
      comparisonId:request.comparisonId,comparisonSha256:request.comparisonSha256};
    local(prefix+saved.id,selected);
    if(draftId===saved.id)state=selected;
    const current=context();
    const apply=foreground||!current.editor||current.editor.id===saved.id&&
      current.editorMode==='WORKING'&&current.editor.revision===request.expectedRevision;
    if(apply)await hooks.onSaved(saved,{foreground,
      keepWorking:current.editor?.id===saved.id&&!same(current.form,request.form)});
    else await hooks.refreshLibrary();
    render();
  }
  function formChanged() {
    if(saveButton){saveButton.dataset.locked='true';saveButton.disabled=true;}
    if(reviewStatus)reviewStatus.textContent='The form changed. Review the current receiving names before saving.';
  }
  async function saveDecision() {
    if(!decisionCurrent()||review.native?.state!=='READY')
      throw new Error('Review these complete receiving names against the current original comparison first.');
    const base={...clone(review.request),reviewSha256:review.native.reviewSha256};
    let original;
    for(const row of pendingRows().filter(row=>SAVE_PATHS.includes(row.path)&&JSON.parse(row.bodyText).id===base.id)) {
      const request=JSON.parse(row.bodyText),{requestId,...fields}=request;
      if(row.path==='draft/receiving-save'&&same(fields,base)){original=request;continue;}
      if(!definite(row))throw new Error('Continue the retained original save for this draft before sending another edition.');
      local('rejected:'+row.key,{...row,releasedAt:new Date().toISOString()});forget(row.key);
    }
    const request=original??{...base,requestId:UUID()};
    await retain('draft/receiving-save',request,(saved,original)=>acceptSaved(saved,original,{foreground:true}));
    notice('The original draft now retains the reviewed incoming-edition decision. Review its saved edition for receiving.');
  }
  async function download(side) {
    const selected=result?.packages.find(row=>row.name===selectedName);
    if(!selected)throw new Error('Choose a compared merchant.');
    const input={id:result.id,name:selected.name,side,expectedComparisonSha256:result.comparisonSha256,
      expectedSha256:selected.files[side].sha256};
    const chunks=[];let next=0,readId,metadata,problem;
    try {
      for(;;) {
        let reply;
        try{reply=await api('edition-file?'+new URLSearchParams({...input,offset:next,limit:196608,...(readId?{readId}:{})}));}
        catch(error) {
          if(!readId||error.code!=='CAPTURED_EDITION_FILE_READ_NOT_FOUND')throw error;
          readId=undefined;
          reply=await api('edition-file?'+new URLSearchParams({...input,offset:next,limit:196608}));
        }
        readId=reply.readId;
        if(reply.id!==input.id||reply.name!==input.name||reply.side!==side||
          reply.comparisonSha256!==input.expectedComparisonSha256||reply.file?.sha256!==input.expectedSha256||
          reply.file.bytes!==selected.files[side].bytes||reply.offset!==next||reply.encoding!=='base64')
          throw new Error('The original comparison file identity changed.');
        const value=Uint8Array.from(atob(reply.data),character=>character.charCodeAt(0));
        if(value.length!==reply.bytesRead||!value.length||value.length>196608||
          next+value.length>reply.file.bytes||reply.nextOffset!==(next+value.length<reply.file.bytes?next+value.length:null))
          throw new Error('The original comparison file range was interrupted.');
        chunks.push(value);next+=value.length;metadata=reply.file;
        if(reply.nextOffset===null){readId=undefined;break;}
      }
      const blob=new Blob(chunks,{type:'application/json'});
      if(blob.size!==metadata.bytes||await digest(await blob.arrayBuffer())!==input.expectedSha256)
        throw new Error('The complete original comparison file SHA-256 changed.');
      const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download=metadata.name;
      link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      notice('Downloaded the complete original '+side+' file.');
    } catch(error){problem=error;throw error;}
    finally {
      if(readId)try{await api('edition-file/release',{id:input.id,comparisonSha256:input.expectedComparisonSha256,readId});}
      catch(error){if(!problem)throw error;}
    }
  }
  function render() {
    if(!state||context().editor?.id!==draftId)return;
    root.replaceChildren();root.hidden=context().editor.kind!=='RECEIVING';if(root.hidden)return;
    const selected=context(),working=selected.editorMode==='WORKING';
    const heading=node('div',undefined,'heading'),title=node('div');
    title.append(node('p','INCOMING EDITIONS','eyebrow'),node('h2','Compare and receive a merchant edition'));heading.append(title);root.append(heading);
    root.append(node('p','Compare the incoming collection with selected installed merchants. Review exact route prices, API declarations, authentication, transport, configuration and file changes, then save receiving names for the selected edition.','muted'));
    const actions=node('div',undefined,'actions');
    actions.append(button('Load installed merchant choices',hooks.loadInventory,!working),
      button('Reset baseline choices for next comparison',()=>{state.baselines={};persist();render();},!working),
      button('Compare this saved receiving edition',compare,!working||!same(selected.form,selected.editor.edition.form)||
        !selected.form.bundle||!/^[a-f0-9]{64}$/.test(selected.form.manifestSha256)));
    root.append(actions);
    const incomingNames=Object.keys(selected.form.names).sort(),installed=hooks.inventory()?.packages??[];
    const baseline=table(['Incoming merchant','Installed baseline for next comparison']);
    for(const name of incomingNames.slice(baselineOffset,baselineOffset+25)) {
      const tr=node('tr'),cell=node('td'),choice=node('select');choice.dataset.editField='true';
      const values=[['','Use current receiving name: '+(selected.form.names[name]??name)],['__none__','No installed baseline'],
        ...installed.map(row=>[row.name,row.name])];
      const current=Object.hasOwn(state.baselines,name)?state.baselines[name]===null?'__none__':state.baselines[name]:'';
      if(current&&!values.some(row=>row[0]===current))values.push([current,current+' · retained selection']);
      for(const [value,label] of values){const option=node('option',label);option.value=value;option.selected=value===current;choice.append(option);}
      choice.disabled=selected.busy||!working;choice.dataset.locked=String(!working);
      choice.setAttribute('aria-label','Installed baseline for '+name);
      choice.addEventListener('change',()=>{const entries=Object.entries(state.baselines).filter(([key])=>key!==name);
        if(choice.value)entries.push([name,choice.value==='__none__'?null:choice.value]);
        state.baselines=Object.fromEntries(entries);persist();});
      cell.append(choice);tr.append(node('td',name),cell);baseline.body.append(tr);
    }
    if(incomingNames.length)root.append(baseline.value);
    const baselinePages=node('div',undefined,'pager');
    if(baselineOffset)baselinePages.append(button('Earlier baselines',()=>{baselineOffset=Math.max(0,baselineOffset-25);render();}));
    if(baselineOffset+25<incomingNames.length)baselinePages.append(button('Later baselines',()=>{baselineOffset+=25;render();}));
    root.append(baselinePages);
    if(state.jobs.length) {
      const fields=node('div',undefined,'fields'),label=node('label','Saved comparison operation'),choice=node('select');
      for(const row of state.jobs){const option=node('option',row.state+' · '+row.createdAt+' · '+row.id);
        option.value=row.id;option.selected=row.id===state.selectedJob;choice.append(option);}
      choice.addEventListener('change',()=>{state.selectedJob=choice.value;persist();});
      label.append(choice);fields.append(label,button('Reopen selected comparison',()=>hooks.openJob(state.selectedJob)));
      root.append(fields);
    }
    if(result) {
      root.append(node('p',result.packages.length+' compared merchants · '+result.sources+' retained captured sources','small'),
        node('p','Comparison SHA-256 '+result.comparisonSha256,'small wrap'));
      const fields=node('div',undefined,'fields'),label=node('label','Compared merchant'),choice=node('select');
      for(const row of result.packages){const option=node('option',row.name+' / '+(row.baselineName??'no baseline'));
        option.value=row.name;option.selected=row.name===selectedName;choice.append(option);}
      choice.addEventListener('change',()=>act(async()=>{selectedName=choice.value;offset=0;await loadPage();}));
      label.append(choice);fields.append(label);root.append(fields);
      const merchant=result.packages.find(row=>row.name===selectedName);
      if(merchant) {
        root.append(details('Installed and incoming package identities',{current:merchant.current,incoming:merchant.incoming}),
          details('Change counts',merchant.summary));
        const price=node('label','Receiving name for '+merchant.name),input=node('input');input.dataset.editField='true';
        input.value=selected.form.names[merchant.name]??merchant.name;input.maxLength=64;input.dataset.locked=String(!working);
        input.addEventListener('input',()=>{hooks.setName(merchant.name,input.value);formChanged();});
        price.append(input);root.append(price);
        const sections=node('div',undefined,'tabs');
        for(const [key,label] of [['routes','Routes and exact prices'],['settings','Merchant settings'],['source','Original API'],
          ['contract','Public API'],['configuration','Compiled configuration'],['files','All package files']])
          sections.append(button(label,async()=>{view=key;offset=0;await loadPage();}));
        root.append(sections);
        if(pageData?.name===merchant.name&&pageData.comparisonSha256===result.comparisonSha256&&pageData.view===view) {
          const rows=table(['Route, field or file','Change','Installed','Incoming']);
          for(const row of pageData.rows) {
            const tr=node('tr'),before=node('td'),after=node('td');
            tr.append(node('td',row.key??row.field??row.name),node('td',row.state??row.category));
            if(view==='routes') {
              before.append(node('code',row.currentPrice.present?row.currentPrice.value:'Absent'));
              after.append(node('code',row.incomingPrice.present?row.incomingPrice.value:'Absent'),
                details('Complete route setting changes',row.changes));
            } else {
              before.append(details('Original value',row.current));after.append(details('Incoming value',row.incoming));
            }
            tr.append(before,after);rows.body.append(tr);
          }
          root.append(pageData.rows.length?rows.value:node('p','No changes in this section.','muted'));
          const paging=node('div',undefined,'pager');paging.append(node('span',pageData.total+' rows'));
          if(offset)paging.append(button('Previous changes',async()=>{offset=Math.max(0,offset-25);await loadPage();}));
          if(pageData.nextOffset!==null)paging.append(button('Next changes',async()=>{offset=pageData.nextOffset;await loadPage();}));
          root.append(paging);
        } else root.append(button('Read complete '+view+' comparison',loadPage));
        const downloads=node('div',undefined,'actions');
        for(const side of ['current','incoming','comparison'])downloads.append(button('Download full '+side+' JSON',()=>download(side)));
        root.append(downloads);
      }
      const decisions=node('div',undefined,'actions');
      decisions.append(button('Review selected receiving names',reviewNames,!working),
        saveButton=button('Save reviewed receiving decision',saveDecision,!decisionCurrent()||review?.native?.state!=='READY'));
      root.append(decisions);
      if(review?.native) {
        root.append(reviewStatus=node('p',decisionCurrent()?'Receiving decision: '+review.native.state:
          'Saved review is retained. Review again after changing the form or selecting another comparison.','muted'),
          details('Original source and receiving-name review',review.native.receiving));
      }
    } else root.append(node('p','Open a completed comparison from Operations or compare the saved receiving edition above.','muted'));
    if(state.saved) {
      const saved=state.saved;
      root.append(node('p','Saved receiving decision · original draft revision '+saved.revision,'small wrap'),
        button('Review this saved decision for receiving',()=>hooks.startCommand('REVIEW',{draftId:saved.id,revision:saved.revision})));
    }
    hooks.controls();
  }
  return {refresh,observeJob,acceptSaved,formChanged};
}
