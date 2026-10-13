// SPDX-License-Identifier: MIT
/** Complete portable customer editor. All dependencies are supplied explicitly. */
export async function bootCustomerReview({root,createReviewModel,initialDocument}) {
  const copy=value=>JSON.parse(JSON.stringify(value));
  const utf8=text=>new TextEncoder().encode(text);
  const decodeBase64=text=>{
    const raw=atob(text),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return bytes;
  };
  const hash=async value=>{
    if(!globalThis.crypto?.subtle)throw new Error('This browser does not expose local SHA-256. Open this file in a current browser that supports Web Crypto.');
    const bytes=typeof value==='string'?utf8(value):value;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  };
  const model=createReviewModel({sha256:hash,decodeBase64,encodeUtf8:utf8});
  let doc=copy(initialDocument),db=null,storageVersion=0,storageReady=false,storageConflict=false;
  let storageQueue=Promise.resolve(),persistTimer=null,searchTimer=null,changeCounter=0;
  let tab='report',selectedId='briefing',kind=null,seriesId=null,offset=0,query='',summaryOffset=0;
  let busy=false,objectUrls=new Set(),reportUrl=null;
  const key='review:'+doc.review_id+':'+doc.package.id;
  const make=(name,attrs={},children=[])=>{
    const node=document.createElement(name);
    for(const [k,v] of Object.entries(attrs)){
      if(k==='class')node.className=v;
      else if(k==='text')node.textContent=v;
      else if(k==='on')for(const [event,handler] of Object.entries(v))node.addEventListener(event,handler);
      else if(k in node&&k!=='list')node[k]=v;
      else node.setAttribute(k,String(v));
    }
    for(const child of children)node.append(typeof child==='string'?document.createTextNode(child):child);
    return node;
  };
  const button=(text,handler,attrs={})=>make('button',{type:'button',text,...attrs,on:{click:()=>act(handler)}});
  const pretty=value=>JSON.stringify(value,null,2);
  const bytesLabel=bytes=>bytes.toLocaleString()+' bytes';
  const short=value=>String(value||'').slice(0,14);
  const now=()=>new Date().toISOString();
  const filename=value=>String(value).replace(/[^A-Za-z0-9._-]/g,'-').slice(0,130)||'customer-review';
  const errorText=error=>error instanceof Error?error.message:String(error);
  const jsonText=value=>JSON.stringify(value,null,2)+'\n';
  let messageNode,storageNode,summaryNode,mainNode,tabBar,reviewerInput,notesInput;
  function message(text,type=''){if(messageNode){messageNode.textContent=text;messageNode.className='status'+(type?' '+type:'');}}
  function storageMessage(text){if(storageNode)storageNode.textContent=text;}
  async function act(fn){
    if(busy)return;
    busy=true;root.inert=true;root.setAttribute('aria-busy','true');
    try{await fn();}catch(error){message(errorText(error),'error');}
    finally{busy=false;root.inert=false;root.removeAttribute('aria-busy');}
  }
  function requireReviewer(){
    if(reviewerInput&&!reviewerInput.value.trim()){
      reviewerInput.setCustomValidity('Enter the reviewer name before saving or downloading.');
      reviewerInput.reportValidity();throw new Error('Enter the reviewer name before saving or downloading.');
    }
    if(reviewerInput){reviewerInput.setCustomValidity('');doc.draft.reviewer=reviewerInput.value;}
  }
  function dirty(){
    changeCounter++;
    updateSummary();
    clearTimeout(persistTimer);
    persistTimer=setTimeout(()=>persist().catch(error=>message(errorText(error),'error')),650);
    if(storageReady&&!storageConflict)storageMessage('Saving the current draft in this browser…');
  }
  function updateSummary(){
    if(!summaryNode)return;
    const value=model.summary(doc),count=Object.keys(doc.draft.decisions).length;
    summaryNode.textContent='Saved revision '+value.revision+' · '+count+' draft decision'+(count===1?'':'s')+
      ' · '+(value.unsaved?'Changes since the last saved revision':'Draft matches saved revision');
  }
  function openDatabase(){
    return new Promise((resolve,reject)=>{
      if(!globalThis.indexedDB){reject(new Error('Local browser storage is unavailable'));return;}
      const request=indexedDB.open('tjl-economic-customer-review',1);
      request.onupgradeneeded=()=>{const database=request.result;
        if(!database.objectStoreNames.contains('documents'))database.createObjectStore('documents',{keyPath:'key'});
        if(!database.objectStoreNames.contains('recovery'))database.createObjectStore('recovery',{keyPath:'key'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Could not open local review storage'));
      request.onblocked=()=>reject(new Error('Another browser window is blocking review storage'));
    });
  }
  function readRecord(){
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('documents','readonly'),request=transaction.objectStore('documents').get(key);
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error);
    });
  }
  function writeRecord(value,expectedVersion,{archivePrevious=false}={}){
    return new Promise((resolve,reject)=>{
      const names=archivePrevious?['documents','recovery']:['documents'];
      const transaction=db.transaction(names,'readwrite'),store=transaction.objectStore('documents');
      let outcome=null,conflict=null;
      const request=store.get(key);
      request.onsuccess=()=>{
        const original=request.result;
        if((original?.version||0)!==expectedVersion){
          conflict=new Error('Another window saved this review. Download your working HTML before restoring the latest browser copy.');
          transaction.abort();return;
        }
        if(archivePrevious&&original)transaction.objectStore('recovery').put({
          ...original,key:key+':'+now()+':'+crypto.randomUUID(),preserved_at:now()
        });
        outcome={key,version:expectedVersion+1,updated_at:now(),document:copy(value)};
        store.put(outcome);
      };
      request.onerror=()=>{conflict=request.error;};
      transaction.oncomplete=()=>resolve(outcome);
      transaction.onabort=()=>reject(conflict||transaction.error||new Error('The local review save was interrupted'));
      transaction.onerror=()=>{};
    });
  }
  async function persist(){
    clearTimeout(persistTimer);persistTimer=null;
    if(!storageReady||storageConflict)return;
    const captured=copy(doc),generation=changeCounter;
    const task=async()=>{
      if(storageConflict)return;
      try{
        const record=await writeRecord(captured,storageVersion);
        storageVersion=record.version;
        if(changeCounter===generation)storageMessage('Draft retained in this browser · '+new Date(record.updated_at).toLocaleString()+'. Download working HTML to carry it elsewhere.');
      }catch(error){
        storageConflict=true;
        storageMessage('Browser save paused. Your current work remains open; download working HTML now to retain it.');
        message(errorText(error),'error');
        throw error;
      }
    };
    storageQueue=storageQueue.catch(()=>{}).then(task);
    return storageQueue;
  }
  function download(data,name,type){
    const url=URL.createObjectURL(new Blob([data],{type}));objectUrls.add(url);
    const anchor=make('a',{href:url,download:name});document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>{URL.revokeObjectURL(url);objectUrls.delete(url);},60000);
  }
  function downloadOriginal(file){
    download(decodeBase64(file.content_base64),file.name.split('/').at(-1),file.content_type);
    message('Downloaded original '+file.name+' · '+bytesLabel(file.bytes)+'.','success');
  }
  function workingHtml(selectedDocument=doc){
    const clone=document.documentElement.cloneNode(true);
    for(const dialog of clone.querySelectorAll('dialog'))dialog.remove();
    clone.querySelector('#review-document').textContent=JSON.stringify(selectedDocument).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    const app=clone.querySelector('#review-root');app.replaceChildren();app.removeAttribute('inert');app.removeAttribute('aria-busy');
    app.append(make('div',{class:'shell'},[make('div',{class:'panel'},[
      make('h1',{text:'Opening your briefing'}),
      make('p',{text:'Checking the complete report, sources and saved review editions.'})
    ])]));
    return '<!doctype html>\n'+clone.outerHTML+'\n';
  }
  async function saveRevision(){
    requireReviewer();
    const next=await model.checkpoint(doc,doc.draft,now());
    doc=next;changeCounter++;updateSummary();await persist().catch(()=>{});
    if(storageReady&&!storageConflict)message('Saved review revision '+doc.editions.length+'. All original source values are unchanged.','success');
    else message('Prepared review revision '+doc.editions.length+' in this open document. Download return JSON or working HTML now to retain it.','error');
    if(tab==='history'||tab==='summary')renderTab();
    return doc;
  }
  async function exportWorking(){
    requireReviewer();await model.validateDocument(doc,{files:false});await persist().catch(()=>{});
    download(workingHtml(),filename(doc.package.label)+'-'+doc.review_id+'-working.html','text/html;charset=utf-8');
    message('Downloaded complete working HTML with original files, saved editions and current draft. Open it in a browser to continue.','success');
  }
  async function exportReturn(){
    await saveRevision();
    const result=model.preview(doc);
    download(jsonText(doc),filename(doc.package.label)+'-'+doc.review_id+'-r'+result.revision+'-return.json','application/json;charset=utf-8');
    message('Downloaded the complete return document for saved revision '+result.revision+'. Send this JSON through your agreed return route.','success');
  }
  function showDialog(title,paragraphs,choices){
    return new Promise(resolve=>{
      const dialog=make('dialog',{},[make('h2',{text:title}),...paragraphs.map(text=>make('p',{text})),
        make('div',{class:'inline-actions'},choices.map(choice=>make('button',{type:'button',text:choice.label,class:choice.primary?'primary':'',on:{click:()=>{
          dialog.close();dialog.remove();resolve(choice.value);
        }}})))]);
      document.body.append(dialog);
      dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();dialog.remove();resolve(null);});
      dialog.showModal();
    });
  }
  async function recoveryVersions(){
    if(!db)throw new Error('This browser has no available recovery storage.');
    await storageQueue.catch(()=>{});
    const records=await new Promise((resolve,reject)=>{
      const transaction=db.transaction('recovery','readonly');
      const request=transaction.objectStore('recovery').getAll(IDBKeyRange.bound(key+':',key+':\uffff'));
      request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);
    });
    const dialog=make('dialog',{},[make('h2',{text:'Preserved browser versions'}),
      make('p',{text:'These complete documents were retained before you selected another file or JSON version. Download a version, then reopen its working HTML or use Open review JSON.'})]);
    if(!records.length)dialog.append(make('p',{text:'No alternative browser version has been replaced in this review.'}));
    for(const record of records.sort((a,b)=>b.preserved_at.localeCompare(a.preserved_at))){
      await model.validateDocument(record.document);
      const metadata=model.summary(record.document);
      const row=make('div',{class:'history-row'},[
        make('strong',{text:'Revision '+metadata.revision+' · '+record.preserved_at}),
        make('p',{text:Object.keys(record.document.draft.decisions).length+' draft decisions · '+record.document.draft.reviewer})
      ]);
      for(const [label,action] of [
        ['Download complete JSON',()=>download(jsonText(record.document),filename(doc.review_id)+'-recovery-'+record.version+'.json','application/json;charset=utf-8')],
        ['Download working HTML',()=>download(workingHtml(record.document),filename(doc.review_id)+'-recovery-'+record.version+'.html','text/html;charset=utf-8')]
      ])row.append(make('button',{type:'button',text:label,on:{click:action}}));
      dialog.append(row);
    }
    dialog.append(make('button',{type:'button',text:'Close',on:{click:()=>{dialog.close();dialog.remove();}}}));
    dialog.addEventListener('cancel',()=>dialog.remove());
    document.body.append(dialog);dialog.showModal();
  }
  async function restoreBrowser(){
    if(!db)throw new Error('This browser has no retained local review. Open your downloaded working HTML.');
    await storageQueue.catch(()=>{});
    const record=await readRecord();
    if(!record)throw new Error('No review has been saved in this browser.');
    await model.validateDocument(record.document);
    if(record.document.review_id!==doc.review_id||record.document.package.id!==doc.package.id)
      throw new Error('The saved browser copy names another original review.');
    const choice=await showDialog('Restore the browser copy?',[
      'The current open document may contain edits that are not in the browser copy.',
      'Download working HTML first if you want to keep both complete versions.'
    ],[{label:'Keep current document',value:false},{label:'Restore browser copy',value:true,primary:true}]);
    if(!choice)return;
    doc=copy(record.document);storageVersion=record.version;storageConflict=false;changeCounter++;
    renderShell();message('Restored the complete saved browser document.','success');
    storageMessage('Browser copy restored · '+new Date(record.updated_at).toLocaleString());
  }
  async function loadJson(file){
    if(!file)return;
    if(file.size>1024*1024*1024)throw new Error('This return document exceeds the supported 1 GiB file input.');
    const incoming=JSON.parse(await file.text());await model.validateDocument(incoming);
    if(incoming.package.id!==doc.package.id||incoming.review_id!==doc.review_id)
      throw new Error('Open this other review in its own complete working HTML.');
    const choice=await showDialog('Open this complete review version?',[
      'The selected JSON has '+incoming.editions.length+' saved editions. Its complete original package has been verified.',
      'Your current browser version will be kept as a recovery copy when local storage is available.'
    ],[{label:'Keep current document',value:false},{label:'Open selected JSON',value:true,primary:true}]);
    if(!choice)return;
    await storageQueue.catch(()=>{});
    if(storageReady&&!storageConflict){
      const saved=await writeRecord(incoming,storageVersion,{archivePrevious:true});
      storageVersion=saved.version;
    }
    doc=copy(incoming);changeCounter++;renderShell();message('Opened the selected complete review JSON.','success');
  }
  function renderShell(){
    if(reportUrl){URL.revokeObjectURL(reportUrl);reportUrl=null;}
    root.replaceChildren();
    const title=make('h1',{text:doc.package.report.title||doc.package.label});
    summaryNode=make('div',{class:'header-meta','aria-live':'polite'});
    messageNode=make('div',{class:'status',role:'status','aria-live':'polite'});
    storageNode=make('div',{class:'storage','aria-live':'polite'});
    const upload=make('input',{type:'file',accept:'.json,application/json',hidden:true,on:{change:()=>{
      const file=upload.files?.[0];upload.value='';act(()=>loadJson(file));
    }}});
    const header=make('header',{class:'masthead'},[
      make('div',{class:'eyebrow',text:'Customer review · complete offline document'}),title,
      make('div',{class:'header-meta'},[
        make('span',{text:'Prepared for '+doc.package.recipient}),
        make('span',{text:doc.package.label}),
        make('span',{text:'Report revision '+doc.package.report.revision})
      ]),summaryNode,
      make('div',{class:'toolbar'},[
        button('Save revision',()=>saveRevision(),{class:'primary'}),
        button('Download return JSON',()=>exportReturn()),
        button('Download working HTML',()=>exportWorking()),
        make('span',{class:'spacer'}),
        button('Open review JSON',()=>upload.click()),
        button('Restore browser copy',()=>restoreBrowser()),
        button('Browser recovery versions',()=>recoveryVersions()),upload
      ])
    ]);
    tabBar=make('nav',{class:'tabs','aria-label':'Review sections'});
    for(const [id,label]of [['report','Original report'],['review','Review targets'],['summary','Decisions'],['history','Saved editions'],['sources','Files & sources']]){
      tabBar.append(button(label,()=>{requireReviewer();tab=id;renderTab();},{'data-tab':id,'aria-pressed':String(tab===id)}));
    }
    mainNode=make('section',{'aria-label':'Selected review section'});
    root.append(make('div',{class:'shell'},[header,messageNode,storageNode,tabBar,mainNode,
      make('p',{class:'footnote',text:'This document works offline. Review choices and editorial proposals are separate from original data. Download working HTML to preserve or transfer unfinished work; return JSON carries the complete source-bound review to the analyst.'})]));
    updateSummary();renderTab();
    if(storageReady&&!storageConflict)storageMessage('Local browser draft retention is available. A working HTML download also preserves the complete document.');
    else if(!storageReady)storageMessage('Local storage is unavailable. Download working HTML regularly to retain your work.');
  }
  function renderTab(){
    for(const node of tabBar.querySelectorAll('[data-tab]'))node.setAttribute('aria-pressed',String(node.dataset.tab===tab));
    mainNode.replaceChildren();reviewerInput=null;notesInput=null;
    if(tab==='report')renderReport();
    if(tab==='review')renderReview();
    if(tab==='summary')renderSummary();
    if(tab==='history')renderHistory();
    if(tab==='sources')renderSources();
  }
  function renderReport(){
    const file=doc.package.files.find(f=>f.name==='report/briefing.html');
    if(!file)throw new Error('The complete original report HTML is missing.');
    if(reportUrl)URL.revokeObjectURL(reportUrl);
    reportUrl=URL.createObjectURL(new Blob([decodeBase64(file.content_base64)],{type:'text/html;charset=utf-8'}));
    const frame=make('iframe',{class:'report-frame',title:'Complete original economic briefing',sandbox:'',src:reportUrl,referrerPolicy:'no-referrer'});
    mainNode.append(make('div',{class:'panel'},[
      make('div',{class:'inline-actions'},[make('h2',{text:'Original report',class:'flex-grow'}),
        button('Download original HTML',()=>downloadOriginal(file)),
        button('Review briefing',()=>{tab='review';selectedId='briefing';renderTab();})]),
      make('p',{class:'field-help',text:'The original full report is embedded below. Its source files and companion reports are available in Files & sources.'}),frame
    ]));
  }
  function reviewerFields(parent){
    reviewerInput=make('input',{value:doc.draft.reviewer,maxLength:1000,id:'reviewer-name',autocomplete:'name'});
    reviewerInput.addEventListener('input',()=>{
      reviewerInput.setCustomValidity('');
      if(reviewerInput.value.trim()){doc.draft.reviewer=reviewerInput.value;dirty();}
    });
    notesInput=make('textarea',{value:doc.draft.notes,maxLength:200000,id:'review-general-notes',rows:3});
    notesInput.addEventListener('input',()=>{doc.draft.notes=notesInput.value;dirty();});
    parent.append(make('label',{htmlFor:'reviewer-name',text:'Reviewer'}),reviewerInput,
      make('label',{htmlFor:'review-general-notes',text:'Overall review notes'}),notesInput);
  }
  function renderReview(){
    const listPanel=make('aside',{class:'panel','aria-label':'Original review targets'});
    const detailPanel=make('div',{class:'panel'});
    mainNode.append(make('div',{class:'review-grid'},[listPanel,detailPanel]));
    listPanel.append(make('h2',{text:'Original targets'}));
    const select=make('select',{'aria-label':'Target kind'});
    for(const [value,label] of [['','All target kinds'],['briefing','Briefing'],['series','Series'],['observation','Observations'],['companion','Companion reports']])
      select.append(make('option',{value,text:label,selected:(kind||'')===value}));
    const search=make('input',{type:'search',value:query,placeholder:'Search labels or original IDs','aria-label':'Search targets',maxLength:2000});
    const scope=make('div',{class:'field-help'});
    const current=model.target(doc.package,selectedId);
    if(seriesId)scope.append(make('span',{text:'Showing original series '+seriesId+' '}),button('Show all series',()=>{seriesId=null;offset=0;renderReviewReplace();}));
    else if(current.series_id)scope.append(button('Filter to this series',()=>{seriesId=current.series_id;offset=0;renderReviewReplace();}));
    select.addEventListener('change',()=>{kind=select.value||null;offset=0;renderTargetList();});
    search.addEventListener('input',()=>{query=search.value;offset=0;clearTimeout(searchTimer);searchTimer=setTimeout(renderTargetList,200);});
    listPanel.append(select,make('div',{class:'divider'}),search,scope);
    const list=make('div',{class:'target-list'}),pager=make('div',{class:'pager'}),range=make('p',{class:'field-help','aria-live':'polite'});
    listPanel.append(range,list,pager);
    function renderTargetList(){
      const page=model.targets(doc.package,{kind,series_id:seriesId,offset,limit:50,query});
      if(offset>=page.total&&offset>0){offset=Math.max(0,Math.floor((page.total-1)/50)*50);return renderTargetList();}
      list.replaceChildren();pager.replaceChildren();
      range.textContent=page.total?(page.offset+1)+'–'+(page.offset+page.rows.length)+' of '+page.total.toLocaleString()+' original targets':'No matching original targets';
      for(const row of page.rows){
        const decision=doc.draft.decisions[row.target_id];
        const node=button('',()=>{
          requireReviewer();selectedId=row.target_id;renderTargetList();renderDetails(detailPanel);
        },{class:'target-button','aria-pressed':String(selectedId===row.target_id)});
        node.append(make('strong',{text:row.label||row.target_id}),make('span',{class:'target-meta',text:row.kind+' · '+row.target_id}));
        if(decision)node.append(make('span',{class:'badge '+decision.status,text:decision.status.replaceAll('_',' ')}));
        list.append(node);
      }
      if(!page.rows.length)list.append(make('p',{class:'empty',text:'Change the kind, series filter or search text to select an original target.'}));
      pager.append(button('Previous',()=>{offset=Math.max(0,offset-50);renderTargetList();},{disabled:offset===0}),
        button('Next',()=>{offset=page.next_offset;renderTargetList();},{disabled:page.next_offset===null}));
    }
    renderTargetList();renderDetails(detailPanel);
  }
  function renderReviewReplace(){mainNode.replaceChildren();renderReview();}
  function renderDetails(panel){
    panel.replaceChildren();const selected=model.target(doc.package,selectedId);
    panel.append(make('h2',{class:'details-title',text:selected.label||selected.target_id}),
      make('p',{class:'identity',text:selected.target_id}),
      make('p',{class:'field-help',text:'Review this original '+selected.kind+'. Source observations, periods, releases and numerical values remain unchanged.'}),
      make('details',{},[make('summary',{text:'Complete original target values'}),make('div',{class:'original'},[make('pre',{text:pretty(selected.original)})])]));
    if(selected.series_id){
      panel.append(button('Show observations from this series',()=>{kind='observation';seriesId=selected.series_id;offset=0;renderReviewReplace();}));
    }
    if(selected.kind==='companion'){
      const namePrefix='companions/'+selected.original.id+'/';
      const files=doc.package.files.filter(file=>file.name.startsWith(namePrefix));
      if(files.length)panel.append(make('div',{class:'inline-actions'},files.map(file=>button('Download '+file.name.slice(namePrefix.length),()=>downloadOriginal(file)))));
    }
    reviewerFields(panel);
    const existing=doc.draft.decisions[selectedId]||null;
    const status=make('select',{id:'decision-status'});
    for(const [value,label] of [['','Not reviewed'],['approved','Approved'],['question','Question'],['change_requested','Change requested']])
      status.append(make('option',{value,text:label,selected:(existing?.status||'')===value}));
    const comment=make('textarea',{id:'decision-comment',value:existing?.comment||'',maxLength:200000,disabled:!existing,rows:5});
    panel.append(make('div',{class:'divider'}),make('label',{htmlFor:'decision-status',text:'Review decision'}),status,
      make('label',{htmlFor:'decision-comment',text:'Comment for this original target'}),comment);
    const proposalPanel=make('div',{class:'edit-box'});panel.append(proposalPanel);
    function record(){
      if(!status.value){delete doc.draft.decisions[selectedId];comment.disabled=true;}
      else{
        comment.disabled=false;const before=doc.draft.decisions[selectedId];
        const value={status:status.value,comment:comment.value};
        if(status.value==='change_requested'&&before?.proposal)value.proposal=copy(before.proposal);
        doc.draft.decisions[selectedId]=value;
      }
      dirty();
    }
    status.addEventListener('change',()=>{record();renderProposal();});
    comment.addEventListener('input',record);
    function renderProposal(){
      proposalPanel.replaceChildren();
      const row=doc.draft.decisions[selectedId];
      if(!selected.fields.length){
        proposalPanel.append(make('p',{class:'field-help',text:'This target accepts a review decision and comment. Its native source values are preserved exactly.'}));return;
      }
      if(row?.status!=='change_requested'){
        proposalPanel.append(make('p',{class:'field-help',text:'Choose Change requested to propose replacement editorial text. Changing to another decision removes its proposal.'}));return;
      }
      const toggle=make('input',{type:'checkbox',checked:!!row.proposal,id:'include-proposal'});
      proposalPanel.append(make('label',{class:'check-label',htmlFor:'include-proposal'},[toggle,'Propose replacement editorial text']));
      const controls=make('div');proposalPanel.append(controls);
      function display(){
        controls.replaceChildren();if(!toggle.checked)return;
        const proposal=doc.draft.decisions[selectedId].proposal;
        const field=make('select',{id:'proposal-field'});
        for(const original of selected.fields)field.append(make('option',{value:original.key,text:original.label,selected:original.key===proposal.field}));
        const value=make('textarea',{id:'proposal-value',value:proposal.value,maxLength:200000,rows:7});
        const current=selected.fields.find(item=>item.key===proposal.field);
        controls.append(make('label',{htmlFor:'proposal-field',text:'Editorial field'}),field,
          make('details',{},[make('summary',{text:'Current original text'}),make('div',{class:'original'},[make('pre',{text:typeof current.value==='string'?current.value:pretty(current.value)})])]),
          make('label',{htmlFor:'proposal-value',text:'Proposed replacement text'}),value);
        field.addEventListener('change',()=>{
          const native=selected.fields.find(item=>item.key===field.value);
          doc.draft.decisions[selectedId].proposal={field:field.value,value:typeof native.value==='string'?native.value:''};
          dirty();display();
        });
        value.addEventListener('input',()=>{doc.draft.decisions[selectedId].proposal.value=value.value;dirty();});
      }
      toggle.addEventListener('change',()=>{
        if(toggle.checked){const original=selected.fields[0];doc.draft.decisions[selectedId].proposal={field:original.key,value:typeof original.value==='string'?original.value:''};}
        else delete doc.draft.decisions[selectedId].proposal;
        dirty();display();
      });display();
    }
    renderProposal();
    panel.append(make('div',{class:'inline-actions'},[
      button('Remove this decision',()=>{
        delete doc.draft.decisions[selectedId];dirty();renderDetails(panel);
      },{class:'danger'}),
      button('Save review revision',()=>saveRevision(),{class:'primary'})
    ]));
  }
  function renderSummary(){
    const panel=make('div',{class:'panel'});mainNode.append(panel);
    panel.append(make('h2',{text:'Current review decisions'}));
    reviewerFields(panel);
    const counts={approved:0,question:0,change_requested:0,proposals:0};
    for(const row of Object.values(doc.draft.decisions)){counts[row.status]++;if(row.proposal)counts.proposals++;}
    panel.append(make('div',{class:'count-grid'},Object.entries(counts).map(([name,value])=>make('div',{class:'count'},[
      make('strong',{text:String(value)}),make('span',{text:name.replaceAll('_',' ')})
    ]))),make('p',{class:'field-help',text:'These are the current draft decisions. Download return JSON saves a complete revision first and includes every decision, original file and source.'}));
    const rows=Object.entries(doc.draft.decisions);
    if(summaryOffset>=rows.length)summaryOffset=0;
    for(const [id,decision]of rows.slice(summaryOffset,summaryOffset+50)){
      const target=model.target(doc.package,id);
      const card=make('article',{class:'review-saved'},[
        make('h3',{text:target.label||id}),make('p',{class:'identity',text:id}),
        make('span',{class:'badge '+decision.status,text:decision.status.replaceAll('_',' ')}),
        make('p',{text:decision.comment||'No comment added.'})
      ]);
      if(decision.proposal)card.append(make('p',{text:'Proposed '+decision.proposal.field}),make('pre',{text:decision.proposal.value}));
      card.append(button('Open original target',()=>{selectedId=id;tab='review';renderTab();}));
      panel.append(card);
    }
    if(!rows.length)panel.append(make('p',{class:'empty',text:'No decisions have been added. Open Review targets to select the original briefing, series, observations or companion reports.'}));
    panel.append(make('div',{class:'pager'},[
      button('Previous',()=>{summaryOffset=Math.max(0,summaryOffset-50);renderTab();},{disabled:summaryOffset===0}),
      make('span',{text:rows.length?(summaryOffset+1)+'–'+Math.min(summaryOffset+50,rows.length)+' of '+rows.length:'0 decisions'}),
      button('Next',()=>{summaryOffset+=50;renderTab();},{disabled:summaryOffset+50>=rows.length}),
      button('Download return JSON',()=>exportReturn(),{class:'primary'})
    ]));
  }
  function renderHistory(){
    const panel=make('div',{class:'panel'},[make('h2',{text:'Complete saved edition chain'}),
      make('p',{text:'Every saved revision retains its parent identity, reviewer, notes and complete decisions. Original package identity: '+doc.package.id,class:'identity'})]);
    mainNode.append(panel);
    if(!doc.editions.length)panel.append(make('p',{class:'empty',text:'No revision has been saved. Your current draft can be saved or downloaded as complete working HTML.'}));
    for(const edition of [...doc.editions].reverse()){
      const row=make('article',{class:'history-row'},[
        make('h3',{text:'Revision '+edition.revision+' · '+edition.reviewer}),
        make('p',{text:edition.created_at+' · '+Object.keys(edition.decisions).length+' decisions'}),
        make('p',{class:'identity',text:'Edition '+edition.id}),
        make('p',{class:'identity',text:'Parent '+(edition.parent_id||'Original review')}),
        make('p',{text:edition.notes||'No overall notes.'}),
        make('details',{},[make('summary',{text:'Complete saved decisions'}),make('div',{class:'original'},[make('pre',{text:pretty(edition.decisions)})])]),
        button('Download this saved edition JSON',()=>download(jsonText(edition),filename(doc.review_id)+'-edition-'+edition.revision+'.json','application/json;charset=utf-8'))
      ]);panel.append(row);
    }
  }
  function renderSources(){
    const panel=make('div',{class:'panel'},[make('h2',{text:'Complete original files and sources'}),
      make('p',{text:'These are the original bytes received with this briefing. Full review validation checks their sizes and SHA-256 identities before downloads are enabled.'}),
      make('p',{class:'identity',text:'Project '+doc.package.project_id+' · Briefing '+doc.package.briefing_id+' · Package '+doc.package.id})]);
    mainNode.append(panel);
    const table=make('table',{class:'file-table'},[make('thead',{},[make('tr',{},['Original file','Bytes and identity','Download'].map(text=>make('th',{text,scope:'col'})))])]);
    const body=make('tbody');table.append(body);
    for(const file of doc.package.files)body.append(make('tr',{},[
      make('td',{text:file.name}),
      make('td',{},[make('div',{text:bytesLabel(file.bytes)}),make('div',{class:'identity',text:file.sha256})]),
      make('td',{},[button('Download',()=>downloadOriginal(file),{'aria-label':'Download original '+file.name})])
    ]));
    panel.append(make('div',{class:'table-scroll'},[table]),make('h3',{text:'Native source responses'}));
    for(const item of doc.package.sources){
      const details=make('details',{},[make('summary',{text:item.source.id+' · '+bytesLabel(item.source.body.bytes)}),
        make('p',{class:'identity',text:'Original response SHA-256 '+item.source.body.sha256}),
        make('div',{class:'inline-actions'},[
          button('Download original response',()=>download(utf8(item.raw_text),'source-'+item.source.id+'.json','application/json;charset=utf-8')),
          button('Download source identity and projections',()=>download(jsonText({source:item.source,number_lexemes:item.number_lexemes,type_tags:item.type_tags}),'source-'+item.source.id+'-identity.json','application/json;charset=utf-8'))
        ]),
        make('div',{class:'original'},[make('pre',{text:pretty(item.source)})])]);
      panel.append(details);
    }
    if(!doc.package.sources.length)panel.append(make('p',{class:'field-help',text:'This package has no separate EconData response members. Any original companion source is preserved in its listed companion files.'}));
    panel.append(button('Download complete immutable package JSON',()=>download(jsonText(doc.package),filename(doc.package.label)+'-original-package.json','application/json;charset=utf-8')));
  }
  try{
    await model.validateDocument(doc);
    try{
      db=await openDatabase();storageReady=true;
      const saved=await readRecord();
      if(saved){
        await model.validateDocument(saved.document);
        if(saved.document.package.id!==doc.package.id||saved.document.review_id!==doc.review_id)
          throw new Error('The retained browser record names another source package.');
        storageVersion=saved.version;
        if(model.canonical(saved.document)!==model.canonical(doc)){
          renderShell();
          const current=model.summary(saved.document),incoming=model.summary(doc);
          const choice=await showDialog('A saved browser draft is available',[
            'Browser copy: saved revision '+current.revision+', '+Object.keys(saved.document.draft.decisions).length+' draft decisions; retained '+saved.updated_at+'.',
            'This file: saved revision '+incoming.revision+', '+Object.keys(doc.draft.decisions).length+' draft decisions.',
            'Choose which complete version to continue. The other browser version is retained as a recovery copy if you choose this file.'
          ],[{label:'Use this file',value:'file'},{label:'Restore browser draft',value:'browser',primary:true}]);
          if(choice==='browser'||choice===null)doc=copy(saved.document);
          else{
            const result=await writeRecord(doc,storageVersion,{archivePrevious:true});storageVersion=result.version;
          }
        }
      }
    }catch(error){
      storageReady=false;storageConflict=false;
      renderShell();message('The complete file is verified. '+errorText(error)+'. Download working HTML to retain your edits.','error');
    }
    renderShell();
    await persist().catch(()=>{});
    message('Complete original report, source files and saved review editions verified.','success');
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='hidden')persist().catch(()=>{});
    });
    window.addEventListener('beforeunload',event=>{
      if(model.summary(doc).unsaved){event.preventDefault();event.returnValue='';}
    });
    window.addEventListener('pagehide',()=>{for(const url of objectUrls)URL.revokeObjectURL(url);});
  }catch(error){
    root.replaceChildren(make('div',{class:'shell'},[make('section',{class:'panel'},[
      make('h1',{text:'This review could not be opened'}),
      make('p',{role:'alert',text:errorText(error)}),
      make('p',{text:'The embedded original document has been left unchanged. Keep this file and ask the issuing analyst for the complete matching package.'}),
      button('Download the embedded document unchanged',()=>download(jsonText(initialDocument),'unopened-original-review.json','application/json;charset=utf-8'))
    ])]));
  }
}
