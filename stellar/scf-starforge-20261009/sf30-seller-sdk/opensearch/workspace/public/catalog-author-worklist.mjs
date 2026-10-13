// MIT. Browser retention of complete author worklists; never applies catalogue decisions.
import {createAuthorWorklist,openAuthorWorklist,exportAuthorWorklist,retainAuthorReturn,retainAuthorDraft,retainAuthorRequest,retainAuthorOutcome,mergeAuthorWorklists,MAX_AUTHOR_WORKLIST_BYTES} from '/recipient/author-worklist.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function database(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('stellar-forge-material-author-worklists',1);let blocked=false;
  request.onupgradeneeded=()=>request.result.createObjectStore('worklists');
  request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};request.onerror=()=>reject(request.error);
  request.onblocked=()=>{blocked=true;reject(Error('Another tab is upgrading browser storage. Keep this worklist open or download it.'));};
 });
}
async function stored(workspaceId){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('worklists','readonly'),request=tx.objectStore('worklists').get(workspaceId);
  let value;request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value??null);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Browser storage read was interrupted.'));});}
 finally{db.close();}
}
async function commit(workspaceId,revision,raw){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('worklists','readwrite'),table=tx.objectStore('worklists'),request=table.get(workspaceId);let conflict=false;
  request.onsuccess=()=>{if((request.result?.revision??0)!==revision){conflict=true;tx.abort();return;}table.put({revision:revision+1,raw},workspaceId);};
  tx.oncomplete=()=>resolve(revision+1);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(conflict?Error('Another tab saved this worklist. Use Merge browser work; your complete current work remains available to download.'):tx.error??Error('Browser storage write was interrupted.'));
 });}finally{db.close();}
}
export function createAuthorWorklistPanel({container,element,getWorkspaceId,getCatalog,getDraft,loadDraft,isHeld,download,report,onReady=()=>{}}){
 const section=element('section',undefined,{'aria-label':'Retained author return worklist'});
 section.innerHTML='<h3>Retained author return worklist</h3><p class="help">Full returns, unfinished choices, prior comparisons and exact saved requests stay in this browser. Download the complete worklist to carry it to another browser or retain an independent copy. Selecting a draft never applies decisions.</p>'+
 '<label>Search retained returns<input id="author-worklist-search" type="search"></label>'+
 '<p id="author-worklist-status" role="status">Select an original catalogue to open its workspace worklist.</p>'+
 '<div class="actions"><button id="author-worklist-download" type="button">Download complete author worklist</button><button id="author-worklist-merge-browser" type="button">Merge browser work</button></div>'+
 '<label>Merge a complete saved author worklist<input id="author-worklist-file" type="file" accept=".json,application/json"></label>'+
 '<div class="actions"><button id="author-worklist-previous" type="button">Previous returns</button><button id="author-worklist-next" type="button">Next returns</button></div><p id="author-worklist-count"></p><div id="author-worklist-items"></div>';
 container.prepend(section);const $=id=>section.querySelector('#'+id);
 let value=null,workspaceId=null,revision=0,active=null,unsaved=false,generation=0,loading=false,saving=false,error=null,chain=Promise.resolve(),timer=null,page=0;
 const message=text=>{$('author-worklist-status').textContent=text;};
 function capture({archivePrevious=false}={}){
  if(workspaceId&&getWorkspaceId()!==workspaceId)throw Error('A different workspace is open. Download the retained original worklist and reload before selecting the new workspace.');
  const draft=getDraft();
  if(loading||!value||!draft?.returnText||!draft.draft)return;
  const result=retainAuthorReturn(value,draft.returnText),item=result.worklist.items.find(x=>x.id===result.id);
  if(!same(item.draft,draft.draft)){
   value=retainAuthorDraft(result.worklist,result.id,draft.draft,{archivePrevious});unsaved=true;generation++;
  }else value=result.worklist;
  active=result.id;
 }
 function schedule(){
  unsaved=true;generation++;clearTimeout(timer);timer=setTimeout(()=>{try{capture();void save();}catch(cause){failed(cause);}},400);
 }
 function failed(cause){error=cause;unsaved=true;message('Not saved in this browser: '+cause.message+' Download the complete worklist before closing.');render();}
 function save(){
  clearTimeout(timer);
  chain=chain.catch(()=>{}).then(async()=>{
   if(!value||loading||error)return;
   capture();if(!unsaved)return;
   const selected=value,id=workspaceId,version=revision,mark=generation,raw=exportAuthorWorklist(selected);saving=true;render();
   try{
    const next=await commit(id,version,raw);
    if(id!==workspaceId)return;
    revision=next;if(mark===generation){unsaved=false;message('Saved '+value.items.length+' complete returns in this browser · storage revision '+revision+'.');}
   }catch(cause){failed(cause);}
   finally{saving=false;render();}
  }).catch(cause=>{saving=false;failed(cause);});return chain;
 }
 async function bind(){
  const id=getWorkspaceId();if(!id||id===workspaceId)return;
  if(workspaceId)throw Error('A different workspace is open. Download the retained original worklist and reload before selecting the new workspace.');
  workspaceId=id;value=createAuthorWorklist(id);revision=0;loading=true;error=null;const mark=++generation;render();
  try{const existing=await stored(id);if(mark!==generation||id!==workspaceId)return;
   if(existing){const received=openAuthorWorklist(existing.raw);if(received.workspaceId!==id)throw Error('Browser worklist identifies another workspace.');value=received;revision=existing.revision;}
   unsaved=false;message('Opened '+value.items.length+' retained returns. Choose the matching catalogue, then a draft.');}
  catch(cause){failed(cause);}
  finally{loading=false;render();onReady();}
 }
 async function mergeBrowser(){
  capture({archivePrevious:true});await chain.catch(()=>{});const id=workspaceId,mark=++generation;loading=true;render();
  try{
   const existing=await stored(id);if(mark!==generation||id!==workspaceId)throw Error('Workspace changed while reading browser work.');
   if(existing){const incoming=openAuthorWorklist(existing.raw);value=mergeAuthorWorklists(value,incoming);revision=existing.revision;}
   error=null;unsaved=true;
  }finally{loading=false;render();onReady();}
  await save();
 }
 async function importFile(file){
  if(!file||file.size<1||file.size>MAX_AUTHOR_WORKLIST_BYTES)throw Error('Select a complete worklist within 128 MiB.');
  capture({archivePrevious:true});const id=workspaceId,mark=++generation;loading=true;render();
  try{
   const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
   if(mark!==generation||id!==workspaceId||$('author-worklist-file').files[0]!==file)throw Error('Worklist file or workspace selection changed.');
   const incoming=openAuthorWorklist(raw);value=mergeAuthorWorklists(value,incoming);unsaved=true;
   message('Complete incoming returns and histories merged. Existing working choices remain selected; imported differing choices are retained in history.');
  }finally{loading=false;render();onReady();}
  await save();
 }
 function select(item,index){
  capture({archivePrevious:true});
  const current=value.items.find(x=>x.id===item.id),draft=index<0?current.draft:current.history[index];
  if(!draft)throw Error('This return has no saved comparison yet.');
  if(current.catalogId!==getCatalog()?.id)throw Error('Choose the original catalogue '+current.catalogId+' first; all work remains retained.');
  loadDraft(current,draft);active=current.id;capture({archivePrevious:index>=0});void save();render();
 }
 function identifierText(value){const span=element('span');String(value).match(/.{1,16}/gu)?.forEach((part,index)=>{if(index)span.append(element('wbr'));span.append(document.createTextNode(part));});return span;}
 function render(){
  const held=loading||saving||isHeld();
  for(const control of section.querySelectorAll('button,input,select'))control.disabled=held||!value;
  $('author-worklist-download').disabled=loading||!value;
  const target=$('author-worklist-items');target.replaceChildren();if(!value)return;
  const query=$('author-worklist-search').value.trim().toLowerCase();
  const filtered=value.items.filter(item=>!query||JSON.stringify([item.reviewer,item.catalogId,item.id,item.draft?.reason,item.draft?.comparison.rows.map(r=>[r.proposal.customerId,r.proposal.description])]).toLowerCase().includes(query));
  page=Math.min(page,Math.max(0,Math.ceil(filtered.length/20)-1));
  $('author-worklist-count').textContent=filtered.length+' complete returns · page '+(page+1)+' of '+Math.max(1,Math.ceil(filtered.length/20));
  $('author-worklist-previous').disabled=held||page===0;$('author-worklist-next').disabled=held||(page+1)*20>=filtered.length;
  for(const item of filtered.slice(page*20,page*20+20)){
   const article=element('article',undefined,{'data-author-return':item.id});
   const heading=element('h4');heading.append(document.createTextNode(item.reviewer+' · '),identifierText(item.catalogId));const identity=element('p',undefined,{class:'help'});identity.append(identifierText(item.id));article.append(heading,identity);
   const state=item.draft?.comparison.catalog,selected=getCatalog();
   const current=state?.id===selected?.id&&state?.revision===selected?.revision&&state?.activeEditionId===selected?.activeEditionId;
   article.append(element('p',(active===item.id?'Selected · ':'')+(current?'Saved comparison; refresh before adoption.':'Different or changed catalogue; retain choices and explicitly compare again.')+' '+item.history.length+' earlier drafts · '+item.requests.length+' exact requests · '+item.outcomes.length+' outcomes.'));
   const actions=element('div',undefined,{class:'actions'}),choose=element('button','Open retained draft',{type:'button','data-author-open':item.id});
   choose.disabled=held||!item.draft||item.catalogId!==selected?.id;choose.addEventListener('click',()=>run(()=>select(item,-1)));actions.append(choose);
   const original=element('button','Download original return',{type:'button'});original.disabled=held;original.addEventListener('click',()=>download('Material_Return_'+item.id+'.json',item.returnText));actions.append(original);
   article.append(actions);
   const history=element('details');history.append(element('summary','Complete retained draft history and original requests'));
   item.history.forEach((draft,index)=>{const button=element('button','Open earlier draft '+(index+1)+' · catalogue revision '+draft.comparison.catalog.revision,{type:'button','data-author-history':String(index)});button.disabled=held||item.catalogId!==selected?.id;button.addEventListener('click',()=>run(()=>select(item,index)));history.append(button);});
   for(const saved of item.requests){const button=element('button','Download original request ',{type:'button'});button.append(identifierText(saved.request.requestId));button.disabled=held;button.addEventListener('click',()=>download('Material_Review_Receive_'+saved.request.requestId+'.json',saved.raw));history.append(button);}
   history.addEventListener('toggle',()=>{if(history.open&&!history.querySelector('pre'))history.append(element('pre',JSON.stringify({history:item.history,outcomes:item.outcomes},null,2)));});article.append(history);target.append(article);
  }
 }
 function run(action){Promise.resolve().then(action).catch(cause=>{report(cause.message,true);failed(cause);});}
 $('author-worklist-search').addEventListener('input',()=>{page=0;render();});
 $('author-worklist-previous').addEventListener('click',()=>{page--;render();});
 $('author-worklist-next').addEventListener('click',()=>{page++;render();});
 $('author-worklist-download').addEventListener('click',()=>run(()=>{let latestError=null;try{capture();}catch(cause){latestError=cause;}download('Material_Author_Worklist_'+workspaceId+'.json',exportAuthorWorklist(value));message(latestError?'The last complete worklist was downloaded. The current draft could not fit: use Save author review choices to retain that complete draft separately. '+latestError.message:'Complete worklist downloaded. Browser storage status: '+(unsaved?'unsaved changes remain.':'saved.'));}));
 $('author-worklist-merge-browser').addEventListener('click',()=>run(mergeBrowser));
 $('author-worklist-file').addEventListener('change',()=>run(()=>importFile($('author-worklist-file').files[0])));
 return{
  bind:()=>{if(getWorkspaceId()!==workspaceId)void bind().catch(failed);},isLoading:()=>loading,capture,schedule,save,buttons:render,hasUnsaved:()=>unsaved||saving,
  selected:()=>active,
  retainDraft(raw,draft){if(!value)throw Error('Open the original workspace worklist first.');const kept=retainAuthorReturn(value,raw);value=retainAuthorDraft(kept.worklist,kept.id,draft,{archivePrevious:true});active=kept.id;unsaved=true;generation++;},
  refresh(){capture();void save();render();},
  async request(request,raw){capture();if(!active)throw Error('Retain the complete author comparison first.');value=retainAuthorRequest(value,active,request,raw);generation++;unsaved=true;await save();render();},
  outcome(outcome){capture();const item=value?.items.find(x=>x.requests.some(r=>r.request.requestId===outcome.id));if(!item)return;value=retainAuthorOutcome(value,item.id,outcome);generation++;unsaved=true;void save();render();}
 };
}
