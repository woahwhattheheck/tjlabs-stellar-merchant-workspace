// MIT. Complete operator workflow on the original MySQL editor capability/session.
import { mysqlWorkspaceController as editor } from '/app.mjs';
const h=(tag,attrs={},children=[])=>{
  const node=document.createElement(tag);
  for(const[key,value]of Object.entries(attrs)){
    if(value===undefined||value===null)continue;
    if(key.startsWith('on'))node.addEventListener(key.slice(2),value);
    else if(key==='class')node.className=value;
    else if(key in node)node[key]=value;
    else node.setAttribute(key,String(value));
  }
  for(const child of children)node.append(child?.nodeType?child:document.createTextNode(String(child)));
  return node;
};
const button=(title,run,attrs={})=>h('button',{type:'button',textContent:title,onclick:()=>work(title,run),...attrs});
const detail=(title,value)=>h('details',{},[h('summary',{textContent:title}),h('pre',{textContent:JSON.stringify(value,null,2)})]);
const label=(title,input,help)=>h('label',{},[h('span',{textContent:title}),input,...(help?[h('small',{textContent:help})]:[])]);
const input=(value='',attrs={})=>h('input',{value,...attrs});
const select=(values,chosen,change)=>h('select',{onchange:change},values.map(([value,text])=>
  h('option',{value,textContent:text,selected:value===chosen})));
const text=value=>value===null||value===undefined?'—':String(value);
const json=input=>JSON.parse(input);
let state=await editor.request('/api/product'),draft=null,publication=null,dataset=null,currentRelease=null,buyerOffer=null;
let busy=false,workingLabel='',lastBuyer=null,publisherPage=null;
const publicationDrafts=new Map();
const publicationKey=()=>publication.releaseId+':'+publication.manifestSha256;
function publicationDraft(){const key=publicationKey();if(!publicationDrafts.has(key))publicationDrafts.set(key,{});return publicationDrafts.get(key);}
const shell=document.getElementById('main'),tabs=shell.querySelector('.tabs'),selectedActions=document.getElementById('selected-actions');
const draftsPanel=h('div',{id:'mysql-product-drafts',hidden:true}),publicationPanel=h('div',{id:'mysql-product-publication',hidden:true});
const draftTab=button('Working drafts & handover',async()=>{await reload();show('drafts');});
const publicationTab=button('Dataset publication',async()=>{await reload();show('publication');});
tabs.append(draftTab,publicationTab);shell.append(draftsPanel,publicationPanel);
function show(name){
  draftsPanel.hidden=name!=='drafts';publicationPanel.hidden=name!=='publication';
  if(['drafts','publication'].includes(name)){
    document.getElementById('build-view').hidden=true;document.getElementById('saved-view').hidden=true;
    for(const id of ['build-tab','saved-tab']){document.getElementById(id).classList.remove('selected');document.getElementById(id).setAttribute('aria-selected','false');}
  }
  for(const[node,selected]of[[draftTab,name==='drafts'],[publicationTab,name==='publication']]){
    node.classList.toggle('selected',selected);node.setAttribute('aria-selected',String(selected));}
}
for(const id of ['build-tab','saved-tab'])document.getElementById(id).addEventListener('click',()=>show('original'));
const strip=h('section',{class:'panel mysql-draft-strip'},[
  h('div',{},[h('strong',{id:'mysql-draft-current',textContent:'Working draft'}),
    h('p',{class:'muted',textContent:'Save unfinished fields and payment choices; every saved version remains available after reopening.'})]),
  button('Save working draft',async()=>{show('drafts');await openSave();}),
]);
shell.prepend(strip);
selectedActions.append(button('Open dataset publication',async()=>{
  const selected=editor.selected;if(!selected)throw new Error('Open a prepared release first.');
  await tracked('publication_create',{requestId:crypto.randomUUID(),releaseId:selected.releaseId,manifestSha256:selected.manifestSha256});
  await openPublication(selected.releaseId,selected.manifestSha256,true);show('publication');
}));

const requestDB=await new Promise((resolve,reject)=>{
  const request=indexedDB.open('starforge-mysql-product-requests',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('requests',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
function transaction(mode,fn){return new Promise((resolve,reject)=>{
  const tx=requestDB.transaction('requests',mode),store=tx.objectStore('requests');let result;
  try{result=fn(store);}catch(error){tx.abort();reject(error);return;}
  tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Request storage interrupted.'));
});}
const put=value=>transaction('readwrite',store=>store.put(value));
const savedRequests=()=>transaction('readonly',store=>store.getAll());
async function invoke(action,input={}){return editor.request('/api/product/action',{action,input});}
async function tracked(action,input,repeatable=true){
  const id=input.requestId??crypto.randomUUID(),record={id,productId:state.productId,action,input:structuredClone(input),
    createdAt:new Date().toISOString(),state:'PENDING',repeatable};
  await put(record);
  try{
    const result=await invoke(action,input);
    await put({...record,state:'COMPLETED',result,updatedAt:new Date().toISOString()});return result;
  }catch(error){
    await put({...record,error:error.message,updatedAt:new Date().toISOString()});throw error;
  }
}
async function work(title,fn){
  if(busy||editor.busy)return;busy=true;workingLabel=title;
  shell.inert=true;shell.classList.add('busy');editor.notice(title+'…','working');
  try{await fn();editor.notice(title+' completed.');}
  catch(error){editor.notice(error.message??'The original connection was interrupted. Read its saved outcome before continuing.','error');}
  finally{busy=false;workingLabel='';shell.inert=false;shell.classList.remove('busy');}
}
async function reload(){
  state=await editor.request('/api/product');
  document.querySelector('header h1').textContent=state.name;
  document.getElementById('mysql-draft-current').textContent=draft?draft.label+' · version '+draft.revision:'Working draft';
  renderDrafts();await renderRequests();renderPublication();
}
let draftsPage={offset:0,limit:25,items:[]},versions=null,actionsPage={offset:0,limit:25,items:[]};
async function loadActions(offset=0){actionsPage=await invoke('actions',{offset,limit:25});await renderRequests();}
async function loadDrafts(offset=0){draftsPage=await invoke('drafts',{offset,limit:25});renderDrafts();}
async function chooseDraft(id,revision){
  const selected=await invoke('draft_get',{draftId:id,...(revision===undefined?{}:{revision})});
  await editor.restoreDraft(selected.draft);draft=selected;
  document.getElementById('mysql-draft-current').textContent=selected.label+' · version '+selected.revision;
  show('original');renderDrafts();
}
async function openSave(){
  const captured=editor.captureDraft(),selection=draft?{id:draft.id,revision:draft.revision}:null;
  const name=input(draft?.label??captured.fields['release-label']??'Working draft',{required:true,maxLength:160});
  const note=h('textarea',{required:true,rows:3,maxLength:2000,placeholder:'What this saved version contains.'});
  const newCopy=h('input',{type:'checkbox'});
  const form=h('form',{class:'mysql-product-form'},[
    label('Draft name',name),label('Version note',note),
    ...(draft?[h('label',{class:'check-row'},[newCopy,'Save as a separate draft'])]:[]),
    h('p',{class:'muted',textContent:'The complete current editor is captured, including the unfinished endpoint. Source review and release preparation stay explicit.'}),
  ]);
  const dialog=h('dialog',{class:'mysql-product-dialog'},[
    h('h2',{textContent:'Save working draft'}),form,
    h('div',{class:'actions'},[
      button('Cancel',async()=>{dialog.close();dialog.remove();}),
      button('Save version',async()=>{
        if(!form.reportValidity())return;
        const own=selection&&!newCopy.checked?selection:{id:crypto.randomUUID(),revision:0};
        const saved=await tracked('draft_save',{requestId:crypto.randomUUID(),draftId:own.id,
          expectedRevision:own.revision,label:name.value,note:note.value,draft:captured});
        draft=saved;dialog.close();dialog.remove();await reload();await loadDrafts();
      },{className:'primary'}),
    ]),
  ]);
  // Dialog controls remain outside the temporarily inert original editor.
  document.body.append(dialog);dialog.showModal();
}
const draftRows=h('div'),draftVersionRows=h('div'),requestRows=h('div'),historyRows=h('div');
function renderDrafts(){
  const items=draftsPage.items;
  draftRows.replaceChildren(...items.map(item=>h('article',{class:'mysql-product-row'},[
    h('div',{},[h('strong',{textContent:item.label}),h('p',{class:'muted',textContent:'Version '+item.revision+' · '+new Date(item.updated).toLocaleString()})]),
    h('div',{class:'actions'},[
      button('Open draft',()=>chooseDraft(item.id)),
      button('Versions',async()=>{versions={draftId:item.id,...await invoke('draft_versions',{draftId:item.id,offset:0,limit:100})};renderVersions();}),
    ]),
  ])));
  if(!items.length)draftRows.append(h('p',{class:'muted',textContent:'Save the current editor to retain its first working version.'}));
  const pager=h('div',{class:'actions'},[
    button('Previous drafts',()=>loadDrafts(Math.max(0,draftsPage.offset-25)),{disabled:draftsPage.offset===0}),
    h('span',{class:'muted',textContent:items.length?'Saved drafts '+(draftsPage.offset+1)+'–'+(draftsPage.offset+items.length)+' of '+draftsPage.total:'No drafts on this page'}),
    button('More drafts',()=>loadDrafts(draftsPage.offset+25),{disabled:!draftsPage.next}),
  ]);
  const current=draft?h('p',{class:'muted',textContent:'Editor selection: '+draft.label+' · version '+draft.revision+
    (draft.revision!==draft.currentRevision?' (latest saved '+draft.currentRevision+')':'')}):h('p',{class:'muted',textContent:'The editor has not selected a saved working version.'});
  draftsPanel.replaceChildren(
    h('section',{class:'panel'},[h('div',{class:'section-heading'},[h('h2',{textContent:'Working drafts'}),button('Save current editor',openSave)]),
      current,draftRows,pager,draftVersionRows]),
    h('section',{class:'panel'},[h('h2',{textContent:'Complete workspace handover'}),
      h('p',{textContent:'Create one portable archive containing the original source and CA, every saved draft, prepared SQL package and customer SDK, publication plans/candidates/reviews, schedule history, and retained dataset versions.'}),
      h('p',{class:'muted',textContent:'Creating a handover closes native query sellers, publication browsers and scheduled work through their original lifecycle. The editor reopens after the archive is retained. Open the intended publication and start its reviewed seller explicitly afterward.'}),
      button('Create complete handover',async()=>{
        const requestId=crypto.randomUUID();await tracked('archive',{requestId});publication=null;dataset=null;buyerOffer=null;
        await reload();await editor.refresh();await renderRequests();
      },{className:'primary'}),historyRows]),
    h('section',{class:'panel'},[h('div',{class:'section-heading'},[h('h2',{textContent:'Saved actions & recovery'}),button('Refresh outcomes',async()=>{await reload();})]),
      h('p',{class:'muted',textContent:'Each retained product request keeps its original UUID and input. Resume an interrupted saved action here. Native publisher writes keep their original native plans, run/review and handoff IDs.'}),requestRows]));
  renderVersions();
  historyRows.replaceChildren(...state.actions.filter(a=>a.action==='archive'&&a.state==='COMPLETED').map(row=>archiveRow(row.result)));
}
function renderVersions(){
  draftVersionRows.replaceChildren();
  if(!versions)return;
  draftVersionRows.append(h('h3',{textContent:'Saved versions'}),...versions.items.map(row=>h('article',{class:'mysql-product-row'},[
    h('div',{},[h('strong',{textContent:'Version '+row.revision}),h('p',{textContent:row.note}),
      h('small',{textContent:new Date(row.created).toLocaleString()})]),
    button('Open version '+row.revision,()=>chooseDraft(row.id,row.revision)),
  ])));
  if(versions.items.length===versions.limit)draftVersionRows.append(button('Earlier versions',async()=>{
    versions={draftId:versions.draftId,...await invoke('draft_versions',{draftId:versions.draftId,
      offset:versions.offset+versions.limit,limit:versions.limit})};renderVersions();}));
}
function archiveRow(value){
  return h('article',{class:'mysql-product-row'},[
    h('div',{},[h('strong',{textContent:value.filename}),h('p',{class:'muted',textContent:value.members+' files · '+value.bytes+' bytes'}),
      h('code',{textContent:value.sha256})]),
    button('Download complete archive',async()=>{
      const result=await editor.request('/api/product/download',{requestId:value.transferId});
      const anchor=h('a',{href:result.download,download:result.filename});document.body.append(anchor);anchor.click();anchor.remove();
    }),
  ]);
}
async function renderRequests(){
  const local=(await savedRequests()).filter(r=>r.productId===state.productId);
  const selectedActions=actionsPage.items.length||actionsPage.offset?actionsPage.items:state.actions;
  const server=new Map([...state.actions,...selectedActions].map(row=>[row.requestId,row]));
  const rows=local.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30);
  for(const row of selectedActions)if(!local.some(x=>x.id===row.requestId))rows.push({
    id:row.requestId,productId:state.productId,action:row.action,input:row.request,createdAt:row.createdAt,
    state:row.state,result:row.result,repeatable:['draft_save','publication_create','dataset_configure','archive'].includes(row.action)});
  requestRows.replaceChildren(...rows.map(row=>{
    const authoritative=server.get(row.id),status=authoritative?.state??row.state;
    return h('article',{class:'mysql-product-request'},[
      h('div',{class:'section-heading'},[h('strong',{textContent:row.action.replaceAll('_',' ')}),h('span',{class:'badge',textContent:status})]),
      h('p',{class:'muted',textContent:row.id+' · '+new Date(row.createdAt).toLocaleString()}),
      detail('Original input and result',{input:row.input,result:authoritative?.result??row.result,error:authoritative?.error??row.error}),
      h('div',{class:'actions'},[
        ...(!['COMPLETED','RESTORED'].includes(status)&&row.repeatable?[button('Read saved outcome',async()=>{
          const read=await invoke('action',{requestId:row.id});
          if(read?.state==='COMPLETED')await put({...row,state:'COMPLETED',result:read.result});
          await reload();
        }),button('Resume original action',async()=>{
          const result=await invoke(row.action,row.input);await put({...row,state:'COMPLETED',result});await reload();
        })]:[]),
        ...(row.action==='archive'&&status==='COMPLETED'?[button('Open handover',async()=>{show('drafts');await reload();})]:[]),
        ...(row.action==='draft_save'&&status==='COMPLETED'?[button('Open saved version',()=>{const result=authoritative?.result??row.result;return chooseDraft(result.id,result.revision);})]:[]),
        ...(row.action==='publisher'?[button('Inspect original publication',async()=>{
          const chosen=state.publications.items.find(x=>x.releaseId===row.input.releaseId);
          if(chosen)await openPublication(chosen.releaseId,chosen.manifestSha256,true);show('publication');
        })]:[]),
      ]),
    ]);
  }));
  if(!rows.length)requestRows.append(h('p',{class:'muted',textContent:'Saved product actions appear here.'}));
  requestRows.append(h('div',{class:'actions'},[
    button('Recent saved actions',()=>loadActions(0),{disabled:actionsPage.offset===0}),
    button('Earlier saved actions',()=>loadActions(actionsPage.offset+actionsPage.limit),
      {disabled:actionsPage.items.length<actionsPage.limit&&actionsPage.offset>0}),
  ]));
}
async function openPublication(releaseId,manifestSha256,withBrowser=false){
  publication=await invoke('publication_open',{releaseId,manifestSha256,browser:withBrowser});
  currentRelease=await invoke('release',{releaseId});dataset=await invoke('dataset_status',{releaseId});
  buyerOffer=null;lastBuyer=null;publisherPage=null;renderPublication();await reload();
}
async function refreshPublication(){
  if(!publication)return;
  publication=await invoke('publication_open',{releaseId:publication.releaseId,manifestSha256:publication.manifestSha256});
  dataset=await invoke('dataset_status',{releaseId:publication.releaseId});publisherPage=null;renderPublication();
}
async function publisher(tool,args={},write=false){
  const input={releaseId:publication.releaseId,instanceId:publication.instanceId,tool,arguments:args};
  const result=write?await tracked('publisher',input,false):await invoke('publisher',input);
  await refreshPublication();return result;
}
const publicationList=h('div'),datasetBody=h('div'),buyerBody=h('div');
function renderPublication(){
  publicationList.replaceChildren(...state.publications.items.map(item=>h('article',{class:'mysql-product-row'},[
    h('div',{},[h('strong',{textContent:item.releaseId}),h('p',{class:'muted',textContent:item.state??item.error?.message??''}),
      h('code',{textContent:item.manifestSha256??''})]),
    ...(item.manifestSha256?[button('Open publication',()=>openPublication(item.releaseId,item.manifestSha256,true))]:[]),
  ])));
  if(!state.publications.items.length)publicationList.append(h('p',{class:'muted',
    textContent:'Prepare a release in the original editor, open it in Saved releases, and select Open dataset publication.'}));
  const active=publication?h('section',{class:'panel'},[
    h('div',{class:'section-heading'},[h('h2',{textContent:publication.releaseId+' publication'}),
      button('Refresh native state',refreshPublication)]),
    h('p',{textContent:'The original publisher retains the approved query, projection, extraction, candidate review and scheduled refreshes.'}),
    h('div',{class:'actions'},[
      ...(publication.browserUrl?[h('a',{href:publication.browserUrl,target:'_blank',rel:'noopener',class:'mysql-product-link',textContent:'Open original publisher'})]:
        [button('Open original publisher',()=>openPublication(publication.releaseId,publication.manifestSha256,true))]),
      button('Close this publication',async()=>{await invoke('publication_close',{releaseId:publication.releaseId,instanceId:publication.instanceId});
        publication=null;dataset=null;buyerOffer=null;await reload();}),
    ]),
    detail('Native publication and schedule state',{native:publication.native,schedule:publication.schedule}),
  ]):null;
  publicationPanel.replaceChildren(h('section',{class:'panel'},[h('div',{class:'section-heading'},[
    h('h2',{textContent:'Prepared-release publications'}),button('Refresh publications',reload)]),publicationList]),
    ...(active?[active,h('section',{class:'panel'},[h('h2',{textContent:'Versioned dataset seller'}),datasetBody]),
      h('section',{class:'panel'},[h('h2',{textContent:'Buyer handoff'}),buyerBody])]:[]));
  if(publication){renderDataset();renderBuyer();}
}
function renderDataset(){
  const current=dataset?.current;
  if(!current){datasetBody.replaceChildren(h('p',{class:'muted',textContent:
    'Use the original publisher to extract a candidate, review its exact public projection, and initialize the dataset target. Then refresh this workspace.'}));return;}
  const version=current.versions;
  const running=publication.dataset;
  const options=currentRelease.choices.paymentOptions??[currentRelease.choices.payment];
  const configurations=dataset.configurations??[];
  const pending=publicationDraft();
  const selection=pending.dataset??={path:'/data',paymentIndex:0,reviewer:'',note:''};
  const terms=h('pre',{textContent:JSON.stringify(options[selection.paymentIndex]??{},null,2)});
  const payment=select(options.map((_,i)=>[String(i),'Original payment option '+(i+1)]),String(selection.paymentIndex),event=>{
    selection.paymentIndex=Number(event.target.value);terms.textContent=JSON.stringify(options[selection.paymentIndex],null,2);});
  const path=input(selection.path,{required:true,maxLength:180,oninput:event=>{selection.path=event.target.value;}});
  const reviewer=input(selection.reviewer,{required:true,maxLength:128,oninput:event=>{selection.reviewer=event.target.value;}});
  const note=h('textarea',{value:selection.note,required:true,rows:3,maxLength:2000,oninput:event=>{selection.note=event.target.value;}});
  const confirmed=h('input',{type:'checkbox',required:true});
  const form=h('form',{class:'mysql-product-form'},[
    h('p',{class:'muted',textContent:'Current snapshot '+version.current+' · revision '+version.revision}),
    label('Dataset route',path),label('Exact prepared payment option',payment),
    h('p',{textContent:'Public origin: '+currentRelease.choices.publicOrigin}),terms,
    label('Reviewer',reviewer),label('Configuration review note',note),
    h('label',{class:'check-row'},[confirmed,'I reviewed this dataset route, original payment terms, snapshot and revision.']),
    button('Save reviewed dataset configuration',async()=>{
      if(!form.reportValidity())return;
      await tracked('dataset_configure',{requestId:crypto.randomUUID(),releaseId:publication.releaseId,
        manifestSha256:publication.manifestSha256,expectedSnapshot:version.current,expectedRevision:version.revision,
        paymentIndex:Number(payment.value),path:path.value,reviewer:reviewer.value,note:note.value});
      await refreshPublication();
    },{className:'primary',disabled:Boolean(running)}),
  ]);
  const list=h('div',{},configurations.map(config=>h('article',{class:'mysql-product-configuration'},[
    h('div',{class:'section-heading'},[h('strong',{textContent:config.resource}),h('span',{class:'badge',textContent:config.id===running?.configId?'RUNNING':'REVIEWED'})]),
    h('p',{textContent:config.reviewer+' · '+config.note}),detail('Original selected terms and configuration',config),
    button('Start this dataset seller',async()=>{
      await invoke('dataset_start',{releaseId:publication.releaseId,instanceId:publication.instanceId,configId:config.id,
        configSha256:config.configSha256,expectedSnapshot:version.current,expectedRevision:version.revision,port:0});
      await refreshPublication();
    },{disabled:Boolean(running)}),
  ])));
  datasetBody.replaceChildren(
    ...(running?[h('div',{class:'mysql-product-row'},[
      h('div',{},[h('strong',{textContent:running.mode}),h('p',{textContent:running.url}),
        h('a',{href:running.url+'/_seller/docs',target:'_blank',rel:'noopener',textContent:'Open native dataset API documentation'})]),
      button('Stop dataset seller',async()=>{await invoke('dataset_stop',{releaseId:publication.releaseId,
        instanceId:publication.instanceId,runId:running.runId});await refreshPublication();}),
    ])]:[h('p',{class:'muted',textContent:'The original dataset target is offline. Select an existing reviewed configuration or save the exact source payment choice below.'})]),
    list,h('details',{},[h('summary',{textContent:'Review another dataset configuration'}),form]));
}
function renderBuyer(){
  const native=publisherPage??publication.native,runs=native.runs??[];
  const pending=publicationDraft(),selection=pending.buyer??={query:'',runId:'',acceptIndex:'0',intentId:''};
  const query=input(selection.query,{maxLength:8192,placeholder:'limit=25&sort=id',oninput:event=>{selection.query=event.target.value;}});
  const runSelect=select(runs.map(row=>[row.id,row.id+' · '+row.state]),buyerOffer?.runId??selection.runId??runs[0]?.id,
    event=>{selection.runId=event.target.value;});
  const offerPanel=h('div');
  const renderOffer=()=>{
    offerPanel.replaceChildren();
    if(!buyerOffer)return;
    const offer=buyerOffer.value;
    const accepts=offer.accepts??offer.offer?.accepts??offer.paymentRequired?.accepts??[];
    const accept=input(selection.acceptIndex,{type:'number',min:0,max:Math.max(0,accepts.length-1),required:true,
      oninput:event=>{selection.acceptIndex=event.target.value;}});
    const intent=input(selection.intentId,{required:true,maxLength:160,placeholder:'customer-order-unique-reference',
      oninput:event=>{selection.intentId=event.target.value;}});
    const form=h('form',{class:'mysql-product-form'},[
      detail('Complete native offer for the selected snapshot',offer),
      label('Accepted payment option index',accept,'Use the zero-based native acceptIndex shown in the offer.'),
      label('Original buyer intent ID',intent),
      button('Prepare buyer configuration',async()=>{
        if(!form.reportValidity())return;
        const offerSha256=offer.offerSha256; if(!offerSha256)throw new Error('Refresh the native offer before preparing this handoff.');
        lastBuyer=await publisher('merchant_publisher_buyer_prepare',{runId:buyerOffer.runId,query:buyerOffer.query,
          offerSha256,acceptIndex:Number(accept.value),intentId:intent.value},true);
        renderBuyer();
      },{className:'primary'}),
    ]);offerPanel.append(form);
  };
  const body=[
    h('p',{class:'muted',textContent:'Read the actual running seller offer for an original candidate snapshot. Save the returned SF88 configuration for the original Buyer workspace or CLI.'}),
    label('Retained extraction run',runSelect),label('First-page dataset query',query),
    button('Read native buyer offer',async()=>{
      const runId=runSelect.value;if(!runId)throw new Error('Choose a retained candidate run.');
      buyerOffer={runId,query:query.value,value:await publisher('merchant_publisher_buyer_offer',{runId,query:query.value})};
      renderBuyer();
    },{disabled:!publication.dataset}),offerPanel,
  ];
  const histories=native.history??[];
  const handoffs=histories.flatMap(row=>{
    const d=row.data??{};const match=/buyer-([a-f0-9-]{36})\.json$/.exec(d.relativePath??d.path??'');
    return match?[{id:match[1],runId:row.run,record:row}]:[];
  });
  if(handoffs.length)body.push(h('h3',{textContent:'Retained buyer configurations'}),...handoffs.map(item=>
    h('article',{class:'mysql-product-row'},[h('div',{},[h('code',{textContent:item.id}),
      h('p',{class:'muted',textContent:item.record.data.configSha256})]),
      button('Reopen original handoff',async()=>{lastBuyer=await publisher('merchant_publisher_buyer_read',{
        runId:item.runId,handoffId:item.id});renderBuyer();})])));
  if(lastBuyer){
    const configText=lastBuyer.configText??JSON.stringify(lastBuyer.config,null,2)+'\n';
    body.push(h('h3',{textContent:'Prepared native buyer configuration'}),detail('Original buyer handoff',lastBuyer),
      button('Download buyer configuration',async()=>{
        const blob=new Blob([configText],{type:'application/json'}),url=URL.createObjectURL(blob);
        const a=h('a',{href:url,download:'buyer-'+(lastBuyer.handoffId??lastBuyer.intentId??'configuration')+'.json'});
        document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }));
  }
  const paging=native.pages??{};
  const nativePage=async(part,offset)=>{
    publisherPage=await invoke('publisher',{releaseId:publication.releaseId,instanceId:publication.instanceId,
      tool:'merchant_publisher_status',arguments:{limit:100,plansOffset:0,
        runsOffset:part==='runs'?offset:paging.runs?.offset??0,
        historyOffset:part==='history'?offset:paging.history?.offset??0}});
    renderBuyer();
  };
  body.push(h('div',{class:'actions'},[
    button('Recent retained runs',()=>nativePage('runs',0),{disabled:!paging.runs?.offset}),
    button('Earlier retained runs',()=>nativePage('runs',paging.runs.next),{disabled:paging.runs?.next==null}),
    button('Recent handoff history',()=>nativePage('history',0),{disabled:!paging.history?.offset}),
    button('Earlier handoff history',()=>nativePage('history',paging.history.next),{disabled:paging.history?.next==null}),
  ]));
  buyerBody.replaceChildren(...body);renderOffer();
}
await loadDrafts();await loadActions();await reload();
